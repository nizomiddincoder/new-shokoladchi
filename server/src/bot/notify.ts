import { InlineKeyboard } from 'grammy';
import type { Language, OrderStatus, Prisma, User } from '@prisma/client';
import { prisma, getSettings } from '../db';
import { env } from '../env';
import { t } from '../i18n';
import { escapeHtml, formatMoney, formatQty, isWeighted, mapsLinks, unitLabel, toNum } from '../lib/format';
import { InputFile, appUrl, bot, safeCall } from './instance';
import { urlToPath } from '../services/storage';
import { logger } from '../logger';

export const ORDER_FULL = {
  items: { orderBy: { id: 'asc' } },
  customer: true,
  seller: true,
  courier: true,
} satisfies Prisma.OrderInclude;

export type OrderFull = Prisma.OrderGetPayload<{ include: typeof ORDER_FULL }>;

export const fullName = (u: Pick<User, 'firstName' | 'lastName'> | null | undefined) =>
  u ? `${u.firstName} ${u.lastName}`.trim() : '';

export function formatPhone(p: string | null | undefined) {
  if (!p) return '';
  const digits = p.replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}

/** Buyurtmaning to'liq matni (guruh, sotuvchi, kuryer uchun) */
export function orderText(order: OrderFull, lang: Language, opts: { header?: string } = {}) {
  const L: string[] = [];
  L.push(opts.header ?? `<b>#${order.number}</b> — ${t(lang, `status_${order.status}` as const)}`);
  L.push('');
  L.push(`${t(lang, 'customer')}: ${escapeHtml(fullName(order.customer))}`);
  L.push(`${t(lang, 'phone')}: ${formatPhone(order.phone || order.customer.phone)}`);
  L.push(`${t(lang, 'type')}: ${t(lang, `delivery_${order.deliveryType}` as const)}`);
  if (order.deliveryType === 'DELIVERY') {
    if (order.address) L.push(`${t(lang, 'address')}: ${escapeHtml(order.address)}`);
    if (order.lat != null && order.lng != null) {
      const m = mapsLinks(order.lat, order.lng);
      L.push(`${t(lang, 'map')}: <a href="${m.google}">Google Maps</a> | <a href="${m.yandex}">Yandex Maps</a>`);
    }
  }
  if (order.comment) L.push(`${t(lang, 'comment')}: ${escapeHtml(order.comment)}`);
  L.push('');
  L.push(`<b>${t(lang, 'items')}:</b>`);
  order.items.forEach((it, i) => {
    const qty = it.finalQty ?? it.qty;
    const name = lang === 'ru' && it.nameRuSnapshot ? it.nameRuSnapshot : it.nameSnapshot;
    const approx = isWeighted(it.unit) && it.finalQty == null ? t(lang, 'approx_note') : '';
    L.push(
      `${i + 1}. ${escapeHtml(name)} — ${formatQty(qty)} ${unitLabel(it.unit, lang)} x ${formatMoney(it.priceSnapshot, lang)} = ${formatMoney(it.lineTotal, lang)}${approx}`,
    );
  });
  L.push('');
  L.push(`${t(lang, 'items_total')}: ${formatMoney(order.itemsTotal, lang)}`);
  if (order.deliveryType === 'DELIVERY') L.push(`${t(lang, 'delivery_fee')}: ${formatMoney(order.deliveryFee, lang)}`);
  L.push(`<b>${t(lang, 'total')}: ${formatMoney(order.finalTotal, lang)}</b>`);
  if (order.seller) L.push(`${t(lang, 'seller')}: ${escapeHtml(fullName(order.seller))}`);
  if (order.courier) L.push(`${t(lang, 'courier')}: ${escapeHtml(fullName(order.courier))} ${formatPhone(order.courier.phone)}`);
  if (order.status === 'CANCELLED') {
    L.push('');
    L.push(`<b>${t(lang, 'status_CANCELLED')}</b>: ${escapeHtml(order.cancelReason || '')}`);
    if (order.cancelledBy) L.push(`${t(lang, 'cancelled_by')}: ${escapeHtml(order.cancelledBy)}`);
  }
  return L.join('\n');
}

const hasApproxItems = (order: OrderFull) => order.items.some((i) => isWeighted(i.unit) && i.finalQty == null);

// ---------- Guruh ----------

export async function sendNewOrderToGroup(order: OrderFull) {
  const kb = new InlineKeyboard().text(t('uz', 'btn_accept'), `o:acc:${order.id}`);
  const res = await safeCall(env.ORDERS_GROUP_CHAT_ID, () =>
    bot.api.sendMessage(env.ORDERS_GROUP_CHAT_ID, orderText(order, 'uz'), {
      parse_mode: 'HTML',
      reply_markup: kb,
      link_preview_options: { is_disabled: true },
    }),
  );
  if (res.ok) {
    await prisma.order.update({
      where: { id: order.id },
      data: { groupChatId: String(res.value.chat.id), groupMessageId: res.value.message_id },
    });
  }
}

/** Guruhdagi xabarni joriy holatga moslab tahrirlaydi */
export async function refreshGroupMessage(order: OrderFull) {
  if (!order.groupChatId || !order.groupMessageId) return;
  const lines = [orderText(order, 'uz')];
  if (order.status !== 'NEW' && order.status !== 'CANCELLED') {
    lines.push('', `<b>${t('uz', 'accepted_by', { name: escapeHtml(fullName(order.seller) || 'Admin') })}</b>`);
  }
  const kb = order.status === 'NEW' ? new InlineKeyboard().text(t('uz', 'btn_accept'), `o:acc:${order.id}`) : undefined;
  await safeCall(order.groupChatId, () =>
    bot.api.editMessageText(order.groupChatId!, order.groupMessageId!, lines.join('\n'), {
      parse_mode: 'HTML',
      reply_markup: kb,
      link_preview_options: { is_disabled: true },
    }),
  );
}

// ---------- Sotuvchi ----------

function sellerKeyboard(order: OrderFull, lang: Language) {
  const kb = new InlineKeyboard();
  if (order.status === 'ACCEPTED') kb.text(t(lang, 'btn_prepare'), `o:prep:${order.id}`).row();
  if (order.status === 'ACCEPTED' || order.status === 'PREPARING') kb.text(t(lang, 'btn_ready'), `o:ready:${order.id}`).row();
  if (order.status === 'READY' && order.deliveryType === 'PICKUP') kb.text(t(lang, 'btn_handover'), `o:hand:${order.id}`).row();
  if (['ACCEPTED', 'PREPARING', 'READY'].includes(order.status)) kb.text(t(lang, 'btn_cancel'), `o:cancel:${order.id}`).row();
  kb.webApp(t(lang, 'btn_open_app'), appUrl(`staff/orders/${order.id}`));
  return kb;
}

export async function sendSellerCard(order: OrderFull) {
  const seller = order.seller;
  if (!seller) return;
  const lang = seller.language;
  await safeCall(seller.telegramId, () =>
    bot.api.sendMessage(String(seller.telegramId), orderText(order, lang), {
      parse_mode: 'HTML',
      reply_markup: sellerKeyboard(order, lang),
      link_preview_options: { is_disabled: true },
    }),
  );
}

// ---------- Mijoz ----------

export async function notifyCustomerCreated(order: OrderFull) {
  const c = order.customer;
  const lang = c.language;
  await safeCall(c.telegramId, () =>
    bot.api.sendMessage(
      String(c.telegramId),
      t(lang, 'c_created', {
        number: order.number,
        total: formatMoney(order.finalTotal, lang),
        approx: hasApproxItems(order) ? t(lang, 'approx_note') : '',
      }),
      { parse_mode: 'HTML', reply_markup: new InlineKeyboard().webApp(t(lang, 'btn_open_app'), appUrl(`orders/${order.id}`)) },
    ),
  );
}

export async function notifyCustomerStatus(order: OrderFull, status: OrderStatus) {
  const c = order.customer;
  const lang = c.language;
  const chat = String(c.telegramId);
  const kb = new InlineKeyboard().webApp(t(lang, 'btn_open_app'), appUrl(`orders/${order.id}`));
  const courierName = escapeHtml(fullName(order.courier));
  let text = '';
  switch (status) {
    case 'ACCEPTED':
      text = t(lang, 'c_accepted', { number: order.number });
      break;
    case 'PREPARING':
      text = t(lang, 'c_preparing', { number: order.number });
      break;
    case 'READY': {
      const settings = await getSettings();
      text =
        order.deliveryType === 'PICKUP'
          ? t(lang, 'c_ready_pickup', {
              number: order.number,
              total: formatMoney(order.finalTotal, lang),
              address: escapeHtml(settings.shopAddress),
            })
          : t(lang, 'c_ready_delivery', { number: order.number, total: formatMoney(order.finalTotal, lang) });
      if (order.finalTotal !== order.initialTotal) {
        text += '\n' + t(lang, 'c_total_changed', { old: formatMoney(order.initialTotal, lang), new: formatMoney(order.finalTotal, lang) });
      }
      const photoPath = urlToPath(order.readyPhotoUrl);
      if (photoPath) {
        const r = await safeCall(chat, () =>
          bot.api.sendPhoto(chat, new InputFile(photoPath), { caption: text, parse_mode: 'HTML', reply_markup: kb }),
        );
        if (r.ok) return;
      }
      break;
    }
    case 'ON_THE_WAY':
      text = t(lang, 'c_on_the_way', { number: order.number, courier: courierName, phone: formatPhone(order.courier?.phone) });
      break;
    case 'DELIVERED':
      text = t(lang, 'c_delivered', { number: order.number });
      break;
    case 'PICKED_UP':
      text = t(lang, 'c_picked_up', { number: order.number });
      break;
    case 'CANCELLED':
      text = t(lang, 'c_cancelled', { number: order.number, reason: escapeHtml(order.cancelReason || '') });
      break;
    default:
      return;
  }
  await safeCall(chat, () => bot.api.sendMessage(chat, text, { parse_mode: 'HTML', reply_markup: kb }));
}

export async function notifyCustomerCourierAssigned(order: OrderFull) {
  const c = order.customer;
  await safeCall(c.telegramId, () =>
    bot.api.sendMessage(
      String(c.telegramId),
      t(c.language, 'c_courier_assigned', { number: order.number, courier: escapeHtml(fullName(order.courier)) }),
      { parse_mode: 'HTML' },
    ),
  );
}

// ---------- Kuryer ----------

type CourierMsg = { chatId: string; messageId: number };

export async function dispatchToCouriers(order: OrderFull) {
  const msgs: CourierMsg[] = [];
  if (env.COURIERS_GROUP_CHAT_ID) {
    const chat = env.COURIERS_GROUP_CHAT_ID;
    const res = await safeCall(chat, () =>
      bot.api.sendMessage(chat, orderText(order, 'uz', { header: t('uz', 'courier_new', { number: order.number }) }), {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard().text(t('uz', 'btn_take'), `o:take:${order.id}`),
        link_preview_options: { is_disabled: true },
      }),
    );
    if (res.ok) msgs.push({ chatId: chat, messageId: res.value.message_id });
  } else {
    const couriers = await prisma.user.findMany({
      where: { role: 'COURIER', isBlocked: false, regStep: 'DONE', botBlocked: false },
    });
    for (const c of couriers) {
      const lang = c.language;
      const res = await safeCall(c.telegramId, () =>
        bot.api.sendMessage(String(c.telegramId), orderText(order, lang, { header: t(lang, 'courier_new', { number: order.number }) }), {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard().text(t(lang, 'btn_take'), `o:take:${order.id}`),
          link_preview_options: { is_disabled: true },
        }),
      );
      if (res.ok) msgs.push({ chatId: String(c.telegramId), messageId: res.value.message_id });
    }
  }
  await prisma.order.update({ where: { id: order.id }, data: { courierMsgs: msgs } });
}

/** Kuryer olgandan keyin boshqa kuryerlardagi xabarni yangilaydi */
export async function refreshCourierOffers(order: OrderFull) {
  const msgs = (order.courierMsgs as CourierMsg[] | null) || [];
  const taken = t('uz', 'already_taken', { name: escapeHtml(fullName(order.courier)) });
  for (const m of msgs) {
    await safeCall(m.chatId, () =>
      bot.api.editMessageText(m.chatId, m.messageId, `${orderText(order, 'uz', { header: `<b>#${order.number}</b>` })}\n\n<b>${taken}</b>`, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      }),
    );
  }
}

function courierKeyboard(order: OrderFull, lang: Language) {
  const kb = new InlineKeyboard();
  if (order.status === 'READY') kb.text(t(lang, 'btn_on_the_way'), `o:way:${order.id}`).row();
  if (order.status === 'ON_THE_WAY') kb.text(t(lang, 'btn_delivered'), `o:dlv:${order.id}`).row();
  kb.webApp(t(lang, 'btn_open_app'), appUrl(`courier/orders/${order.id}`));
  return kb;
}

export async function sendCourierCard(order: OrderFull) {
  const c = order.courier;
  if (!c) return;
  const lang = c.language;
  await safeCall(c.telegramId, () =>
    bot.api.sendMessage(String(c.telegramId), orderText(order, lang), {
      parse_mode: 'HTML',
      reply_markup: courierKeyboard(order, lang),
      link_preview_options: { is_disabled: true },
    }),
  );
}

// ---------- Umumiy ----------

export async function notifyStaffCancelled(order: OrderFull) {
  const targets = [order.seller, order.courier].filter(Boolean) as User[];
  for (const u of targets) {
    await safeCall(u.telegramId, () =>
      bot.api.sendMessage(String(u.telegramId), orderText(order, u.language), {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      }),
    );
  }
}

export async function adminRecipients(): Promise<{ chatId: string; lang: Language }[]> {
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN', isBlocked: false } });
  const map = new Map<string, Language>();
  for (const a of admins) map.set(String(a.telegramId), a.language);
  for (const id of env.ADMIN_TELEGRAM_IDS) if (!map.has(id)) map.set(id, 'uz');
  return [...map.entries()].map(([chatId, lang]) => ({ chatId, lang }));
}

export async function sendTimeoutWarning(order: OrderFull, minutes: number) {
  const textUz = t('uz', 'timeout_warn', { number: order.number, minutes });
  await safeCall(env.ORDERS_GROUP_CHAT_ID, () =>
    bot.api.sendMessage(env.ORDERS_GROUP_CHAT_ID, textUz, {
      parse_mode: 'HTML',
      reply_parameters: order.groupMessageId ? { message_id: order.groupMessageId, allow_sending_without_reply: true } : undefined,
    }),
  );
  for (const a of await adminRecipients()) {
    await safeCall(a.chatId, () =>
      bot.api.sendMessage(a.chatId, `${t(a.lang, 'timeout_warn', { number: order.number, minutes })}\n\n${orderText(order, a.lang)}`, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      }),
    );
  }
}

export async function sendLowStockReport() {
  const products = await prisma.$queryRaw<
    { id: number; nameUz: string; nameRu: string; stock: unknown; lowStockThreshold: unknown; unit: string }[]
  >`SELECT id, "nameUz", "nameRu", stock, "lowStockThreshold", unit FROM "Product" WHERE "isActive" = true AND stock <= "lowStockThreshold" ORDER BY stock ASC`;
  if (!products.length) return 0;
  const warehouse = await prisma.user.findMany({ where: { role: 'WAREHOUSE', isBlocked: false, regStep: 'DONE' } });
  const recipients = new Map<string, Language>();
  for (const w of warehouse) recipients.set(String(w.telegramId), w.language);
  for (const a of await adminRecipients()) if (!recipients.has(a.chatId)) recipients.set(a.chatId, a.lang);
  for (const [chatId, lang] of recipients) {
    const lines = [t(lang, 'low_stock_title', { count: products.length }), ''];
    for (const p of products.slice(0, 80)) {
      lines.push(
        t(lang, 'low_stock_line', {
          name: escapeHtml(lang === 'ru' ? p.nameRu : p.nameUz),
          stock: formatQty(toNum(p.stock)),
          unit: unitLabel(p.unit as never, lang),
          threshold: formatQty(toNum(p.lowStockThreshold)),
        }),
      );
    }
    await safeCall(chatId, () =>
      bot.api.sendMessage(chatId, lines.join('\n'), {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard().webApp(t(lang, 'btn_open_app'), appUrl('warehouse/low')),
      }),
    );
  }
  logger.info({ count: products.length }, 'Kam qolganlar hisoboti yuborildi');
  return products.length;
}
