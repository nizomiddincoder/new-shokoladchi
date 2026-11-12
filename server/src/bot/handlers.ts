import { InlineKeyboard, Keyboard, type Context } from 'grammy';
import type { Language, Role, User } from '@prisma/client';
import { prisma } from '../db';
import { env } from '../env';
import { t } from '../i18n';
import { escapeHtml, formatDateTime, formatMoney } from '../lib/format';
import { isEnvAdmin, actorLabelOf } from '../lib/auth';
import { audit } from '../lib/audit';
import { logger } from '../logger';
import { appUrl, bot, safeCall, telegramFileUrl } from './instance';
import { formatPhone } from './notify';
import { saveImage } from '../services/storage';
import {
  acceptOrder,
  cancelOrder,
  courierDelivered,
  courierOnTheWay,
  courierTake,
  handOver,
  isHttpError,
  loadOrder,
  markReady,
  startPreparing,
  type OrderActor,
} from '../services/orders';

const langOf = (u: User | null | undefined, ctx?: Context): Language =>
  u?.language ?? (ctx?.from?.language_code === 'ru' ? 'ru' : 'uz');

const roleName = (lang: Language, role: Role) => t(lang, `role_${role}` as const);

/** Foydalanuvchi roliga mos menyu tugmasini o'rnatadi */
export async function setMenuButtonFor(user: User) {
  const lang = user.language;
  const chatId = Number(user.telegramId);
  if (user.regStep !== 'DONE' || user.isBlocked) {
    await safeCall(chatId, () => bot.api.setChatMenuButton({ chat_id: chatId, menu_button: { type: 'commands' } }));
    return;
  }
  const text = user.role === 'CUSTOMER' ? t(lang, 'menu_shop') : t(lang, 'menu_panel');
  await safeCall(chatId, () =>
    bot.api.setChatMenuButton({ chat_id: chatId, menu_button: { type: 'web_app', text, web_app: { url: appUrl() } } }),
  );
}

/**
 * Mini App tugmasi INLINE bo'lishi shart: reply (oddiy) klaviatura tugmasidan ochilgan
 * Mini App'ga Telegram initData bermaydi va server foydalanuvchini taniy olmaydi.
 */
function mainKeyboard(user: User) {
  const lang = user.language;
  const label =
    user.role === 'ADMIN' ? t(lang, 'admin_panel') : user.role === 'CUSTOMER' ? t(lang, 'open_shop') : t(lang, 'staff_panel');
  return new InlineKeyboard().webApp(label, appUrl());
}

/** Avval qolgan oddiy klaviaturani (eski versiya yoki "Raqamni ulashish") jimgina olib tashlaydi */
async function removeReplyKeyboard(ctx: Context) {
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const r = await safeCall(chatId, () => bot.api.sendMessage(chatId, '...', { reply_markup: { remove_keyboard: true } }));
  if (r.ok) await safeCall(chatId, () => bot.api.deleteMessage(chatId, r.value.message_id));
}

async function sendMainMenu(ctx: Context, user: User, intro?: string) {
  const lang = user.language;
  const name = escapeHtml(actorLabelOf(user));
  const text =
    intro ??
    (user.role === 'ADMIN'
      ? t(lang, 'welcome_admin')
      : user.role === 'CUSTOMER'
        ? t(lang, 'welcome_back', { name })
        : t(lang, 'welcome_staff', { name, role: roleName(lang, user.role) }));
  await removeReplyKeyboard(ctx);
  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: mainKeyboard(user) });
  await setMenuButtonFor(user);
}

function langKeyboard() {
  return new InlineKeyboard().text("O'zbekcha", 'lang:uz').text('Русский', 'lang:ru');
}

function phoneKeyboard(lang: Language) {
  return new Keyboard().requestContact(t(lang, 'phone_button')).resized().oneTime();
}

async function getOrCreateUser(ctx: Context): Promise<User> {
  const from = ctx.from!;
  const telegramId = BigInt(from.id);
  let user = await prisma.user.findUnique({ where: { telegramId } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        telegramId,
        username: from.username,
        language: from.language_code === 'ru' ? 'ru' : 'uz',
        firstName: '',
      },
    });
  } else if (from.username && user.username !== from.username) {
    user = await prisma.user.update({ where: { id: user.id }, data: { username: from.username, botBlocked: false } });
  } else if (user.botBlocked) {
    user = await prisma.user.update({ where: { id: user.id }, data: { botBlocked: false } });
  }
  if (isEnvAdmin(from.id) && (user.role !== 'ADMIN' || user.regStep !== 'DONE' || user.isBlocked)) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        role: 'ADMIN',
        regStep: 'DONE',
        isBlocked: false,
        firstName: user.firstName || from.first_name || 'Admin',
        lastName: user.lastName || from.last_name || '',
        phone: user.phone || env.ADMIN_PHONE || null,
        pendingInviteId: null,
      },
    });
  }
  return user;
}

function inviteIsValid(inv: { usedAt: Date | null; revoked: boolean; expiresAt: Date } | null) {
  return !!inv && !inv.usedAt && !inv.revoked && inv.expiresAt.getTime() > Date.now();
}

function toActor(user: User): OrderActor {
  return { userId: user.id, role: user.role, label: actorLabelOf(user) };
}

export function registerHandlers() {
  // Faqat shaxsiy chatdagi buyruqlar
  const pm = bot.chatType('private');

  pm.command('start', async (ctx) => {
    let user = await getOrCreateUser(ctx);
    const lang = user.language;
    const payload = (ctx.match || '').trim();

    if (user.isBlocked) return ctx.reply(t(lang, 'blocked'), { reply_markup: { remove_keyboard: true } });

    if (payload.startsWith('inv_')) {
      if (user.role === 'ADMIN') return sendMainMenu(ctx, user);
      const token = payload.slice(4);
      const invite = await prisma.invite.findUnique({ where: { token } });
      if (!inviteIsValid(invite)) return ctx.reply(t(lang, 'invite_invalid'));
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          pendingInviteId: invite!.id,
          regStep: 'PHONE',
          firstName: invite!.staffName,
          lastName: '',
        },
      });
      return ctx.reply(t(lang, 'invite_accepted', { role: roleName(lang, invite!.role) }), {
        parse_mode: 'HTML',
        reply_markup: phoneKeyboard(lang),
      });
    }

    if (user.regStep === 'DONE') return sendMainMenu(ctx, user);
    if (user.regStep === 'LANG' || !user.firstName) {
      await prisma.user.update({ where: { id: user.id }, data: { regStep: 'LANG' } });
      return ctx.reply(t(lang, 'choose_lang'), { reply_markup: langKeyboard() });
    }
    if (user.regStep === 'NAME') return ctx.reply(t(lang, 'ask_name'));
    return ctx.reply(t(lang, 'ask_phone'), { parse_mode: 'HTML', reply_markup: phoneKeyboard(lang) });
  });

  pm.command('lang', async (ctx) => {
    await getOrCreateUser(ctx);
    await ctx.reply(t('uz', 'choose_lang'), { reply_markup: langKeyboard() });
  });

  pm.command('help', async (ctx) => {
    const user = await getOrCreateUser(ctx);
    await ctx.reply(t(user.language, 'help', { phone: escapeHtml(env.ADMIN_PHONE || '-') }), { parse_mode: 'HTML' });
  });

  pm.command('orders', async (ctx) => {
    const user = await getOrCreateUser(ctx);
    const lang = user.language;
    if (user.regStep !== 'DONE') return ctx.reply(t(lang, 'not_registered'));
    const orders = await prisma.order.findMany({
      where: { customerId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    if (!orders.length) return ctx.reply(t(lang, 'no_orders'));
    const lines = [t(lang, 'orders_title'), ''];
    for (const o of orders) {
      lines.push(
        `<b>#${o.number}</b> — ${t(lang, `status_${o.status}` as const)}\n${formatDateTime(o.createdAt)} · ${formatMoney(o.finalTotal, lang)}`,
      );
    }
    await ctx.reply(lines.join('\n\n'), {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard().webApp(t(lang, 'btn_open_app'), appUrl('orders')),
    });
  });

  bot.callbackQuery(/^lang:(uz|ru)$/, async (ctx) => {
    const lang = ctx.match[1] as Language;
    let user = await getOrCreateUser(ctx);
    user = await prisma.user.update({
      where: { id: user.id },
      data: { language: lang, ...(user.regStep === 'LANG' ? { regStep: 'NAME' } : {}) },
    });
    await ctx.answerCallbackQuery(t(lang, 'lang_changed'));
    await ctx.editMessageReplyMarkup().catch(() => undefined);
    if (user.regStep === 'NAME') return ctx.reply(t(lang, 'ask_name'));
    if (user.regStep === 'DONE') return sendMainMenu(ctx, user, t(lang, 'lang_changed'));
    return undefined;
  });

  pm.on('message:contact', async (ctx) => {
    let user = await getOrCreateUser(ctx);
    const lang = user.language;
    if (user.isBlocked) return ctx.reply(t(lang, 'blocked'));
    const contact = ctx.message.contact;
    if (contact.user_id !== ctx.from.id) return ctx.reply(t(lang, 'contact_not_own'), { reply_markup: phoneKeyboard(lang) });
    if (user.regStep !== 'PHONE' && user.regStep !== 'DONE') {
      return ctx.reply(user.regStep === 'NAME' ? t(lang, 'ask_name') : t(lang, 'choose_lang'), {
        reply_markup: user.regStep === 'LANG' ? langKeyboard() : undefined,
      });
    }
    const phone = formatPhone(contact.phone_number);

    if (user.pendingInviteId) {
      const now = new Date();
      const claimed = await prisma.invite.updateMany({
        where: { id: user.pendingInviteId, usedAt: null, revoked: false, expiresAt: { gt: now } },
        data: { usedAt: now, usedById: user.id },
      });
      const invite = await prisma.invite.findUnique({ where: { id: user.pendingInviteId } });
      if (claimed.count !== 1 || !invite) {
        await prisma.user.update({
          where: { id: user.id },
          data: { pendingInviteId: null, regStep: 'DONE', phone },
        });
        await ctx.reply(t(lang, 'invite_invalid'));
        return sendMainMenu(ctx, { ...user, regStep: 'DONE', phone });
      }
      user = await prisma.user.update({
        where: { id: user.id },
        data: { role: invite.role, phone, regStep: 'DONE', pendingInviteId: null, isBlocked: false },
      });
      await audit({ userId: user.id, label: actorLabelOf(user) }, 'staff.join', 'User', user.id, null, { role: invite.role, inviteId: invite.id });
      return sendMainMenu(ctx, user, t(lang, 'invite_done', { name: escapeHtml(actorLabelOf(user)), role: roleName(lang, user.role) }));
    }

    const wasDone = user.regStep === 'DONE';
    user = await prisma.user.update({ where: { id: user.id }, data: { phone, regStep: 'DONE' } });
    return sendMainMenu(ctx, user, wasDone ? undefined : t(lang, 'registered', { name: escapeHtml(actorLabelOf(user)) }));
  });

  pm.on('message:photo', async (ctx) => {
    const user = await getOrCreateUser(ctx);
    const lang = user.language;
    if (!user.awaitingPhotoOrderId || user.isBlocked || !['SELLER', 'ADMIN'].includes(user.role)) {
      return ctx.reply(t(lang, 'photo_unexpected'));
    }
    const orderId = user.awaitingPhotoOrderId;
    try {
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      const file = await ctx.api.getFile(photo.file_id);
      const res = await fetch(telegramFileUrl(file.file_path!));
      if (!res.ok) throw new Error('Telegram fayl yuklanmadi');
      const saved = await saveImage(Buffer.from(await res.arrayBuffer()), 'orders');
      const order = await markReady(orderId, toActor(user), saved.url);
      await ctx.reply(t(lang, 'photo_saved', { number: order.number }), { parse_mode: 'HTML' });
    } catch (err) {
      await prisma.user.update({ where: { id: user.id }, data: { awaitingPhotoOrderId: null } });
      if (isHttpError(err)) return ctx.reply(err.message);
      logger.error({ err }, 'Tayyor rasmini saqlashda xato');
      return ctx.reply('Xato / Ошибка');
    }
    return undefined;
  });

  pm.on('message:text', async (ctx) => {
    let user = await getOrCreateUser(ctx);
    const lang = user.language;
    const text = ctx.message.text.trim();
    if (text.startsWith('/')) return undefined;
    if (user.isBlocked) return ctx.reply(t(lang, 'blocked'));

    if (user.awaitingCancelOrderId) {
      const orderId = user.awaitingCancelOrderId;
      await prisma.user.update({ where: { id: user.id }, data: { awaitingCancelOrderId: null } });
      try {
        const order = await cancelOrder(orderId, toActor(user), text);
        return ctx.reply(t(lang, 'cancelled_ok', { number: order.number }), { parse_mode: 'HTML' });
      } catch (err) {
        if (isHttpError(err)) return ctx.reply(err.message);
        throw err;
      }
    }

    if (user.regStep === 'LANG') return ctx.reply(t(lang, 'choose_lang'), { reply_markup: langKeyboard() });
    if (user.regStep === 'NAME') {
      if (text.length < 2 || text.length > 60 || /[<>]/.test(text) || /^\+?\d[\d\s-]+$/.test(text)) {
        return ctx.reply(t(lang, 'name_invalid'));
      }
      const [first, ...rest] = text.split(/\s+/);
      user = await prisma.user.update({
        where: { id: user.id },
        data: { firstName: first, lastName: rest.join(' '), regStep: 'PHONE' },
      });
      return ctx.reply(t(lang, 'ask_phone'), { parse_mode: 'HTML', reply_markup: phoneKeyboard(lang) });
    }
    if (user.regStep === 'PHONE') {
      return ctx.reply(t(lang, 'phone_only_button'), { parse_mode: 'HTML', reply_markup: phoneKeyboard(lang) });
    }
    return sendMainMenu(ctx, user);
  });

  // ---------- Buyurtma tugmalari (guruh va shaxsiy chat) ----------
  bot.callbackQuery(/^o:(acc|prep|ready|cancel|hand|take|way|dlv):(\d+)$/, async (ctx) => {
    const action = ctx.match[1];
    const orderId = Number(ctx.match[2]);
    const from = ctx.from;
    let user = await prisma.user.findUnique({ where: { telegramId: BigInt(from.id) } });
    if (isEnvAdmin(from.id)) user = await getOrCreateUser(ctx);
    const lang = langOf(user, ctx);
    if (!user || user.regStep !== 'DONE' || user.isBlocked) {
      return ctx.answerCallbackQuery({ text: t(lang, 'not_registered_staff'), show_alert: true });
    }
    const actor = toActor(user);
    const staffRoles: Record<string, Role[]> = {
      acc: ['SELLER', 'ADMIN'],
      prep: ['SELLER', 'ADMIN'],
      ready: ['SELLER', 'ADMIN'],
      cancel: ['SELLER', 'ADMIN'],
      hand: ['SELLER', 'ADMIN'],
      take: ['COURIER', 'ADMIN'],
      way: ['COURIER', 'ADMIN'],
      dlv: ['COURIER', 'ADMIN'],
    };
    if (!staffRoles[action].includes(user.role)) {
      return ctx.answerCallbackQuery({ text: t(lang, 'not_allowed'), show_alert: true });
    }
    try {
      switch (action) {
        case 'acc': {
          await acceptOrder(orderId, actor);
          return ctx.answerCallbackQuery(t(lang, 'done'));
        }
        case 'prep':
          await startPreparing(orderId, actor);
          await ctx.editMessageReplyMarkup().catch(() => undefined);
          return ctx.answerCallbackQuery(t(lang, 'done'));
        case 'ready': {
          const order = await loadOrder(orderId);
          if (!['ACCEPTED', 'PREPARING'].includes(order.status)) {
            return ctx.answerCallbackQuery({ text: t(lang, 'wrong_status'), show_alert: true });
          }
          if (user.role === 'SELLER' && order.sellerId !== user.id) {
            return ctx.answerCallbackQuery({ text: t(lang, 'not_allowed'), show_alert: true });
          }
          await prisma.user.update({ where: { id: user.id }, data: { awaitingPhotoOrderId: orderId, awaitingCancelOrderId: null } });
          await ctx.answerCallbackQuery();
          await bot.api.sendMessage(from.id, t(lang, 'send_photo', { number: order.number }), { parse_mode: 'HTML' });
          return undefined;
        }
        case 'cancel': {
          const order = await loadOrder(orderId);
          if (['DELIVERED', 'PICKED_UP', 'CANCELLED'].includes(order.status)) {
            return ctx.answerCallbackQuery({ text: t(lang, 'wrong_status'), show_alert: true });
          }
          await prisma.user.update({ where: { id: user.id }, data: { awaitingCancelOrderId: orderId, awaitingPhotoOrderId: null } });
          await ctx.answerCallbackQuery();
          await bot.api.sendMessage(from.id, t(lang, 'enter_cancel_reason', { number: order.number }), {
            parse_mode: 'HTML',
            reply_markup: { force_reply: true },
          });
          return undefined;
        }
        case 'hand':
          await handOver(orderId, actor);
          await ctx.editMessageReplyMarkup().catch(() => undefined);
          return ctx.answerCallbackQuery(t(lang, 'done'));
        case 'take': {
          const order = await courierTake(orderId, actor);
          await ctx.answerCallbackQuery(t(lang, 'courier_assigned_you', { number: order.number }).replace(/<[^>]+>/g, ''));
          return undefined;
        }
        case 'way':
          await courierOnTheWay(orderId, actor);
          await ctx.editMessageReplyMarkup().catch(() => undefined);
          return ctx.answerCallbackQuery(t(lang, 'done'));
        case 'dlv':
          await courierDelivered(orderId, actor);
          await ctx.editMessageReplyMarkup().catch(() => undefined);
          return ctx.answerCallbackQuery(t(lang, 'done'));
      }
    } catch (err) {
      if (isHttpError(err)) {
        let msg = err.message;
        const by = (err.details as { by?: string } | undefined)?.by;
        if (err.code === 'ALREADY_ACCEPTED') msg = t(lang, 'already_accepted', { name: by || '-' });
        else if (err.code === 'ALREADY_TAKEN') msg = t(lang, 'already_taken', { name: by || '-' });
        else if (err.code === 'WRONG_STATUS') msg = t(lang, 'wrong_status');
        else if (err.status === 403) msg = t(lang, 'not_allowed');
        return ctx.answerCallbackQuery({ text: msg.slice(0, 190), show_alert: true });
      }
      throw err;
    }
    return undefined;
  });

  bot.on('callback_query:data', (ctx) => ctx.answerCallbackQuery());

  bot.catch((err) => {
    logger.error({ err: err.error, update: err.ctx?.update?.update_id }, 'Bot handler xatosi');
  });
}

/** Bot buyruqlari va webhook'ni o'rnatadi */
export async function setupBot() {
  await bot.init();
  const commandsUz = [
    { command: 'start', description: 'Boshlash' },
    { command: 'orders', description: 'Oxirgi buyurtmalar' },
    { command: 'lang', description: 'Tilni o\'zgartirish' },
    { command: 'help', description: 'Yordam' },
  ];
  const commandsRu = [
    { command: 'start', description: 'Начать' },
    { command: 'orders', description: 'Последние заказы' },
    { command: 'lang', description: 'Сменить язык' },
    { command: 'help', description: 'Помощь' },
  ];
  await safeCall(0, () => bot.api.setMyCommands(commandsUz, { scope: { type: 'all_private_chats' } }));
  await safeCall(0, () => bot.api.setMyCommands(commandsRu, { scope: { type: 'all_private_chats' }, language_code: 'ru' }));
  return bot.botInfo;
}
