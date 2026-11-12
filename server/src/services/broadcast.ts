import { InlineKeyboard } from 'grammy';
import type { BroadcastSegment, Prisma } from '@prisma/client';
import { prisma } from '../db';
import { logger } from '../logger';
import { InputFile, appUrl, bot, safeCall } from '../bot/instance';
import { t } from '../i18n';
import { urlToPath } from './storage';

const RATE_DELAY_MS = 45; // ~22 xabar/sekund (limit 25)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function segmentWhere(segment: BroadcastSegment): Prisma.UserWhereInput {
  const base: Prisma.UserWhereInput = { role: 'CUSTOMER', regStep: 'DONE', isBlocked: false };
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  switch (segment) {
    case 'ACTIVE_30':
      return { ...base, orders: { some: { createdAt: { gte: since }, status: { not: 'CANCELLED' } } } };
    case 'INACTIVE_30':
      return { ...base, orders: { some: {}, none: { createdAt: { gte: since } } } };
    case 'NO_ORDERS':
      return { ...base, orders: { none: {} } };
    default:
      return base;
  }
}

let running = false;

/** Navbatdagi rassilkalarni ketma-ket yuboradi */
export async function runBroadcasts() {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const b = await prisma.broadcast.findFirst({
        where: { status: { in: ['QUEUED', 'RUNNING'] } },
        orderBy: { id: 'asc' },
      });
      if (!b) break;
      const where = segmentWhere(b.segment);
      if (b.status === 'QUEUED') {
        const total = await prisma.user.count({ where });
        await prisma.broadcast.update({ where: { id: b.id }, data: { status: 'RUNNING', total, startedAt: new Date() } });
      }
      const photoPath = urlToPath(b.imageUrl);
      let lastUserId = b.lastUserId;
      let { sent, blocked, failed } = b;
      for (;;) {
        const users = await prisma.user.findMany({
          where: { ...where, id: { gt: lastUserId } },
          orderBy: { id: 'asc' },
          take: 100,
          select: { id: true, telegramId: true, language: true },
        });
        if (!users.length) break;
        for (const u of users) {
          const chatId = String(u.telegramId);
          const kb = new InlineKeyboard().webApp(t(u.language, 'open_shop'), appUrl());
          const res = await safeCall<unknown>(chatId, () =>
            photoPath
              ? bot.api.sendPhoto(chatId, new InputFile(photoPath), { caption: b.text, parse_mode: 'HTML', reply_markup: kb })
              : bot.api.sendMessage(chatId, b.text, { parse_mode: 'HTML', reply_markup: kb }),
          );
          if (res.ok) sent++;
          else if (res.blocked) blocked++;
          else failed++;
          lastUserId = u.id;
          await sleep(RATE_DELAY_MS);
        }
        await prisma.broadcast.update({ where: { id: b.id }, data: { sent, blocked, failed, lastUserId } });
      }
      await prisma.broadcast.update({
        where: { id: b.id },
        data: { status: 'DONE', finishedAt: new Date(), sent, blocked, failed, lastUserId },
      });
      logger.info({ id: b.id, sent, blocked, failed }, 'Rassilka yakunlandi');
    }
  } catch (err) {
    logger.error({ err }, 'Rassilkada xato');
  } finally {
    running = false;
  }
}
