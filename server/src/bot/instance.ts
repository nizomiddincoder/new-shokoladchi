import crypto from 'node:crypto';
import { Bot, GrammyError, HttpError as TgHttpError, InputFile } from 'grammy';
import { env } from '../env';
import { logger } from '../logger';
import { prisma } from '../db';

export const bot = new Bot(env.BOT_TOKEN, { client: { apiRoot: env.TELEGRAM_API_ROOT } });

export const telegramFileUrl = (filePath: string) => `${env.TELEGRAM_API_ROOT}/file/bot${env.BOT_TOKEN}/${filePath}`;

export const WEBHOOK_PATH = '/bot/webhook';
export const WEBHOOK_SECRET = crypto.createHash('sha256').update('wh:' + env.BOT_TOKEN).digest('hex').slice(0, 48);

export const appUrl = (path = '') => `${env.WEBAPP_URL}/app/${path.replace(/^\/+/, '')}`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type SendResult<T> = { ok: true; value: T } | { ok: false; blocked: boolean; error: string };

/**
 * Telegram so'rovini xavfsiz bajaradi: 403 (bot bloklangan) va boshqa xatolar serverni yiqitmaydi.
 * 429 bo'lsa bir marta kutib qayta urinadi.
 */
export async function safeCall<T>(chatId: number | string | bigint, fn: () => Promise<T>): Promise<SendResult<T>> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return { ok: true, value: await fn() };
    } catch (err) {
      if (err instanceof GrammyError) {
        if (err.error_code === 429 && attempt === 0) {
          const retry = Number(err.parameters?.retry_after || 1);
          await sleep((retry + 0.5) * 1000);
          continue;
        }
        const blocked =
          err.error_code === 403 ||
          (err.error_code === 400 && /chat not found|user is deactivated/i.test(err.description));
        if (blocked && String(chatId)[0] !== '-') {
          await prisma.user
            .updateMany({ where: { telegramId: BigInt(String(chatId)) }, data: { botBlocked: true } })
            .catch(() => undefined);
        }
        if (!/message is not modified/i.test(err.description)) {
          logger.warn({ chatId: String(chatId), code: err.error_code, desc: err.description }, 'Telegram xatosi');
        }
        return { ok: false, blocked, error: err.description };
      }
      if (err instanceof TgHttpError) {
        logger.warn({ chatId: String(chatId), err: err.message }, 'Telegram tarmoq xatosi');
        return { ok: false, blocked: false, error: err.message };
      }
      logger.error({ err }, 'Telegram so\'rovida kutilmagan xato');
      return { ok: false, blocked: false, error: String(err) };
    }
  }
  return { ok: false, blocked: false, error: 'retry' };
}

export { InputFile };
