import type { DeliveryType, OrderStatus, Prisma, Role, User } from '@prisma/client';
import { prisma, getSettings } from '../db';
import { logger } from '../logger';
import { HttpError, badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { isWithinWorkHours, lineTotal, round3, toNum } from '../lib/format';
import { audit } from '../lib/audit';
import {
  ORDER_FULL,
  type OrderFull,
  dispatchToCouriers,
  fullName,
  notifyCustomerCourierAssigned,
  notifyCustomerCreated,
  notifyCustomerStatus,
  notifyStaffCancelled,
  refreshCourierOffers,
  refreshGroupMessage,
  sendCourierCard,
  sendNewOrderToGroup,
  sendSellerCard,
} from '../bot/notify';

export type OrderActor = {
  userId: number | null;
  role: Role;
  label: string;
};

export const FINAL_STATUSES: OrderStatus[] = ['DELIVERED', 'PICKED_UP', 'CANCELLED'];

export async function loadOrder(id: number): Promise<OrderFull> {
  const order = await prisma.order.findUnique({ where: { id }, include: ORDER_FULL });
  if (!order) throw notFound('ORDER_NOT_FOUND', 'Buyurtma topilmadi');
  return order;
}

/** Bildirishnomalar xatosi asosiy amalni buzmasligi uchun */
function background(label: string, fn: () => Promise<unknown>) {
  fn().catch((err) => logger.error({ err, label }, 'Fon vazifasida xato'));
}

const isStepMultiple = (qty: number, step: number) => {
  if (step <= 0) return true;
  const k = qty / step;
  return Math.abs(k - Math.round(k)) < 1e-6;
};

export function validateQty(qty: number, step: number, minQty: number) {
  if (!(qty > 0)) return false;
  if (qty + 1e-9 < minQty) return false;
  return isStepMultiple(qty, step);
}

// ======================= YARATISH =======================

export type CreateOrderInput = {
  deliveryType: DeliveryType;
  address?: string;
  lat?: number | null;
  lng?: number | null;
  comment?: string;
};

export async function createOrder(customer: User, input: CreateOrderInput) {
  const settings = await getSettings();
  if (!isWithinWorkHours(settings.workHoursStart, settings.workHoursEnd)) {
    throw badRequest('SHOP_CLOSED', `Ish vaqti: ${settings.workHoursStart} - ${settings.workHoursEnd}`, {
      start: settings.workHoursStart,
      end: settings.workHoursEnd,
    });
  }
  if (!customer.phone) throw badRequest('NO_PHONE', 'Telefon raqam topilmadi');
  if (input.deliveryType === 'DELIVERY' && (input.lat == null || input.lng == null) && !input.address?.trim()) {
    throw badRequest('ADDRESS_REQUIRED', 'Yetkazish uchun joylashuv yoki manzil kerak');
  }

  const cart = await prisma.cartItem.findMany({
    where: { userId: customer.id },
    include: { product: true },
    orderBy: { id: 'asc' },
  });
  if (!cart.length) throw badRequest('CART_EMPTY', 'Savatcha bo\'sh');

  const invalid: { productId: number; name: string; reason: string }[] = [];
  for (const c of cart) {
    const p = c.product;
    if (!p.isActive) invalid.push({ productId: p.id, name: p.nameUz, reason: 'INACTIVE' });
    else if (!validateQty(toNum(c.qty), toNum(p.step), toNum(p.minQty)))
      invalid.push({ productId: p.id, name: p.nameUz, reason: 'BAD_QTY' });
  }
  if (invalid.length) throw badRequest('CART_INVALID', 'Savatchadagi ba\'zi mahsulotlar mavjud emas', { items: invalid });

  const lines = cart.map((c) => {
    const qty = round3(toNum(c.qty));
    return {
      productId: c.productId,
      nameSnapshot: c.product.nameUz,
      nameRuSnapshot: c.product.nameRu,
      unit: c.product.unit,
      qty,
      priceSnapshot: c.product.price,
      lineTotal: lineTotal(qty, c.product.price),
    };
  });
  const itemsTotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  if (itemsTotal < settings.minOrderAmount) {
    throw badRequest('MIN_ORDER', 'Minimal buyurtma summasi yetarli emas', { minOrderAmount: settings.minOrderAmount, itemsTotal });
  }
  const deliveryFee =
    input.deliveryType === 'DELIVERY'
      ? settings.freeDeliveryFrom > 0 && itemsTotal >= settings.freeDeliveryFrom
        ? 0
        : settings.deliveryFee
      : 0;
  const finalTotal = itemsTotal + deliveryFee;

  const order = await prisma.$transaction(async (tx) => {
    const insufficient: { productId: number; name: string; available: number; requested: number }[] = [];
    for (const l of lines) {
      const res = await tx.product.updateMany({
        where: { id: l.productId, isActive: true, stock: { gte: l.qty } },
        data: { stock: { decrement: l.qty } },
      });
      if (res.count === 0) {
        const p = await tx.product.findUnique({ where: { id: l.productId }, select: { stock: true, nameUz: true } });
        insufficient.push({ productId: l.productId, name: p?.nameUz || l.nameSnapshot, available: toNum(p?.stock), requested: l.qty });
      }
    }
    if (insufficient.length) {
      throw conflict(
        'INSUFFICIENT_STOCK',
        `Qoldiq yetarli emas: ${insufficient.map((i) => i.name).join(', ')}`,
        { items: insufficient },
      );
    }
    const created = await tx.order.create({
      data: {
        customerId: customer.id,
        deliveryType: input.deliveryType,
        address: input.deliveryType === 'DELIVERY' ? (input.address || '').trim() : '',
        lat: input.deliveryType === 'DELIVERY' ? input.lat ?? null : null,
        lng: input.deliveryType === 'DELIVERY' ? input.lng ?? null : null,
        comment: (input.comment || '').trim(),
        phone: customer.phone || '',
        itemsTotal,
        deliveryFee,
        finalTotal,
        initialTotal: finalTotal,
        items: { create: lines },
      },
    });
    for (const l of lines) {
      const p = await tx.product.findUnique({ where: { id: l.productId }, select: { stock: true } });
      await tx.stockMovement.create({
        data: {
          productId: l.productId,
          type: 'ORDER',
          qty: -l.qty,
          stockAfter: p?.stock,
          orderId: created.id,
          note: `Buyurtma #${created.number}`,
          userId: customer.id,
          actorLabel: fullName(customer),
        },
      });
    }
    await tx.cartItem.deleteMany({ where: { userId: customer.id } });
    return created;
  });

  const full = await loadOrder(order.id);
  background('newOrder', async () => {
    await sendNewOrderToGroup(full);
    await notifyCustomerCreated(full);
  });
  return full;
}

// ======================= HOLATLAR =======================

function assertSellerAccess(order: OrderFull, actor: OrderActor) {
  if (actor.role === 'ADMIN') return;
  if (actor.role !== 'SELLER') throw forbidden();
  if (order.sellerId !== actor.userId) throw forbidden('NOT_YOUR_ORDER', 'Bu buyurtma sizga tegishli emas');
}

async function guardedUpdate(
  orderId: number,
  where: Prisma.OrderWhereInput,
  data: Prisma.OrderUncheckedUpdateManyInput,
) {
  const res = await prisma.order.updateMany({ where: { id: orderId, ...where }, data });
  return res.count === 1;
}

export async function acceptOrder(orderId: number, actor: OrderActor) {
  if (actor.role !== 'SELLER' && actor.role !== 'ADMIN') throw forbidden();
  const ok = await guardedUpdate(orderId, { status: 'NEW' }, {
    status: 'ACCEPTED',
    sellerId: actor.userId,
    acceptedAt: new Date(),
  });
  const order = await loadOrder(orderId);
  if (!ok) {
    if (order.status === 'CANCELLED') throw conflict('ORDER_CANCELLED', 'Buyurtma bekor qilingan');
    throw conflict('ALREADY_ACCEPTED', `Buyurtmani allaqachon ${fullName(order.seller) || 'boshqa xodim'} qabul qilgan`, {
      by: fullName(order.seller),
    });
  }
  await audit(actor, 'order.accept', 'Order', order.id, { status: 'NEW' }, { status: 'ACCEPTED' });
  background('accept', async () => {
    await refreshGroupMessage(order);
    await sendSellerCard(order);
    await notifyCustomerStatus(order, 'ACCEPTED');
  });
  return order;
}

export async function startPreparing(orderId: number, actor: OrderActor) {
  const before = await loadOrder(orderId);
  assertSellerAccess(before, actor);
  const ok = await guardedUpdate(orderId, { status: 'ACCEPTED' }, { status: 'PREPARING', preparingAt: new Date() });
  if (!ok) throw conflict('WRONG_STATUS', 'Bu amal hozirgi holatda mumkin emas');
  const order = await loadOrder(orderId);
  await audit(actor, 'order.prepare', 'Order', order.id, { status: before.status }, { status: order.status });
  background('prepare', async () => {
    await refreshGroupMessage(order);
    await sendSellerCard(order);
    await notifyCustomerStatus(order, 'PREPARING');
  });
  return order;
}

/** Sotuvchi kg/gramm mahsulotlarni aniq tortgandan keyin miqdorni kiritadi */
export async function setFinalWeights(orderId: number, actor: OrderActor, items: { itemId: number; finalQty: number }[]) {
  const before = await loadOrder(orderId);
  assertSellerAccess(before, actor);
  if (!['ACCEPTED', 'PREPARING'].includes(before.status)) throw conflict('WRONG_STATUS', 'Bu amal hozirgi holatda mumkin emas');

  await prisma.$transaction(async (tx) => {
    for (const { itemId, finalQty } of items) {
      const item = before.items.find((i) => i.id === itemId);
      if (!item) throw badRequest('ITEM_NOT_FOUND', 'Mahsulot qatori topilmadi');
      if (!(finalQty > 0)) throw badRequest('BAD_QTY', 'Miqdor noto\'g\'ri');
      const qty = round3(finalQty);
      const prev = toNum(item.finalQty ?? item.qty);
      const delta = round3(qty - prev);
      if (delta !== 0) {
        const p = await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: delta } },
          select: { stock: true },
        });
        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            type: 'ORDER',
            qty: -delta,
            stockAfter: p.stock,
            orderId,
            note: `Aniq tortish #${before.number}`,
            userId: actor.userId,
            actorLabel: actor.label,
          },
        });
      }
      await tx.orderItem.update({
        where: { id: itemId },
        data: { finalQty: qty, lineTotal: lineTotal(qty, item.priceSnapshot) },
      });
    }
    const all = await tx.orderItem.findMany({ where: { orderId } });
    const itemsTotal = all.reduce((s, i) => s + i.lineTotal, 0);
    await tx.order.update({
      where: { id: orderId },
      data: { itemsTotal, finalTotal: itemsTotal + before.deliveryFee },
    });
  });
  const order = await loadOrder(orderId);
  await audit(actor, 'order.weights', 'Order', order.id, { finalTotal: before.finalTotal }, { finalTotal: order.finalTotal, items });
  background('weights', () => refreshGroupMessage(order));
  return order;
}

export async function markReady(orderId: number, actor: OrderActor, photoUrl: string) {
  if (!photoUrl) throw badRequest('PHOTO_REQUIRED', 'Tayyor buyurtma rasmi majburiy');
  const before = await loadOrder(orderId);
  assertSellerAccess(before, actor);
  const ok = await guardedUpdate(
    orderId,
    { status: { in: ['ACCEPTED', 'PREPARING'] } },
    { status: 'READY', readyAt: new Date(), readyPhotoUrl: photoUrl },
  );
  if (!ok) throw conflict('WRONG_STATUS', 'Bu amal hozirgi holatda mumkin emas');
  if (actor.userId) {
    await prisma.user.update({ where: { id: actor.userId }, data: { awaitingPhotoOrderId: null } }).catch(() => undefined);
  }
  const order = await loadOrder(orderId);
  await audit(actor, 'order.ready', 'Order', order.id, { status: before.status }, { status: 'READY', photo: photoUrl });
  background('ready', async () => {
    await refreshGroupMessage(order);
    await notifyCustomerStatus(order, 'READY');
    if (order.deliveryType === 'DELIVERY') await dispatchToCouriers(order);
    else await sendSellerCard(order);
  });
  return order;
}

export async function handOver(orderId: number, actor: OrderActor) {
  const before = await loadOrder(orderId);
  assertSellerAccess(before, actor);
  const ok = await guardedUpdate(orderId, { status: 'READY', deliveryType: 'PICKUP' }, { status: 'PICKED_UP', pickedUpAt: new Date() });
  if (!ok) throw conflict('WRONG_STATUS', 'Bu amal hozirgi holatda mumkin emas');
  await bumpSoldCount(orderId);
  const order = await loadOrder(orderId);
  await audit(actor, 'order.picked_up', 'Order', order.id, { status: 'READY' }, { status: 'PICKED_UP' });
  background('handover', async () => {
    await refreshGroupMessage(order);
    await notifyCustomerStatus(order, 'PICKED_UP');
  });
  return order;
}

export async function courierTake(orderId: number, actor: OrderActor) {
  if (actor.role !== 'COURIER' && actor.role !== 'ADMIN') throw forbidden();
  if (!actor.userId) throw forbidden('TG_ONLY', 'Kuryer sifatida faqat Telegram orqali');
  const ok = await guardedUpdate(
    orderId,
    { status: 'READY', deliveryType: 'DELIVERY', courierId: null },
    { courierId: actor.userId },
  );
  const order = await loadOrder(orderId);
  if (!ok) {
    if (order.courierId) {
      throw conflict('ALREADY_TAKEN', `Buyurtmani allaqachon ${fullName(order.courier)} olgan`, { by: fullName(order.courier) });
    }
    throw conflict('WRONG_STATUS', 'Bu amal hozirgi holatda mumkin emas');
  }
  await audit(actor, 'order.courier_take', 'Order', order.id, null, { courierId: actor.userId });
  background('take', async () => {
    await refreshCourierOffers(order);
    await sendCourierCard(order);
    await notifyCustomerCourierAssigned(order);
  });
  return order;
}

function assertCourierAccess(order: OrderFull, actor: OrderActor) {
  if (actor.role === 'ADMIN') return;
  if (actor.role !== 'COURIER' || order.courierId !== actor.userId) throw forbidden('NOT_YOUR_ORDER', 'Bu buyurtma sizga tegishli emas');
}

export async function courierOnTheWay(orderId: number, actor: OrderActor) {
  const before = await loadOrder(orderId);
  assertCourierAccess(before, actor);
  const ok = await guardedUpdate(
    orderId,
    { status: 'READY', deliveryType: 'DELIVERY', courierId: { not: null } },
    { status: 'ON_THE_WAY', pickedUpAt: new Date() },
  );
  if (!ok) throw conflict('WRONG_STATUS', 'Bu amal hozirgi holatda mumkin emas');
  const order = await loadOrder(orderId);
  await audit(actor, 'order.on_the_way', 'Order', order.id, { status: 'READY' }, { status: 'ON_THE_WAY' });
  background('onTheWay', async () => {
    await refreshGroupMessage(order);
    await sendCourierCard(order);
    await notifyCustomerStatus(order, 'ON_THE_WAY');
  });
  return order;
}

export async function courierDelivered(orderId: number, actor: OrderActor) {
  const before = await loadOrder(orderId);
  assertCourierAccess(before, actor);
  const ok = await guardedUpdate(orderId, { status: 'ON_THE_WAY' }, { status: 'DELIVERED', deliveredAt: new Date() });
  if (!ok) throw conflict('WRONG_STATUS', 'Bu amal hozirgi holatda mumkin emas');
  await bumpSoldCount(orderId);
  const order = await loadOrder(orderId);
  await audit(actor, 'order.delivered', 'Order', order.id, { status: 'ON_THE_WAY' }, { status: 'DELIVERED' });
  background('delivered', async () => {
    await refreshGroupMessage(order);
    await notifyCustomerStatus(order, 'DELIVERED');
  });
  return order;
}

async function bumpSoldCount(orderId: number) {
  const items = await prisma.orderItem.findMany({ where: { orderId } });
  for (const it of items) {
    await prisma.product
      .update({ where: { id: it.productId }, data: { soldCount: { increment: toNum(it.finalQty ?? it.qty) } } })
      .catch(() => undefined);
  }
}

export async function cancelOrder(orderId: number, actor: OrderActor, reason: string) {
  const text = (reason || '').trim();
  if (text.length < 2) throw badRequest('REASON_REQUIRED', 'Bekor qilish sababi majburiy');
  const before = await loadOrder(orderId);
  if (FINAL_STATUSES.includes(before.status)) throw conflict('WRONG_STATUS', 'Buyurtma allaqachon yakunlangan');

  let allowedFrom: OrderStatus[];
  if (actor.role === 'ADMIN') {
    allowedFrom = ['NEW', 'ACCEPTED', 'PREPARING', 'READY', 'ON_THE_WAY'];
  } else if (actor.role === 'SELLER') {
    if (before.status !== 'NEW' && before.sellerId !== actor.userId) throw forbidden('NOT_YOUR_ORDER', 'Bu buyurtma sizga tegishli emas');
    allowedFrom = ['NEW', 'ACCEPTED', 'PREPARING', 'READY', 'ON_THE_WAY'];
  } else if (actor.role === 'CUSTOMER' || before.customerId === actor.userId) {
    if (before.customerId !== actor.userId) throw forbidden();
    allowedFrom = ['NEW'];
    if (before.status !== 'NEW') throw conflict('CANNOT_CANCEL', 'Buyurtma qabul qilingan, bekor qilish uchun do\'kon bilan bog\'laning');
  } else {
    throw forbidden();
  }

  await prisma.$transaction(async (tx) => {
    const res = await tx.order.updateMany({
      where: { id: orderId, status: { in: allowedFrom } },
      data: {
        status: 'CANCELLED',
        cancelReason: text.slice(0, 500),
        cancelledBy: actor.label || actor.role,
        cancelledAt: new Date(),
      },
    });
    if (res.count !== 1) throw conflict('WRONG_STATUS', 'Bu amal hozirgi holatda mumkin emas');
    for (const it of before.items) {
      const qty = toNum(it.finalQty ?? it.qty);
      const p = await tx.product.update({
        where: { id: it.productId },
        data: { stock: { increment: qty } },
        select: { stock: true },
      });
      await tx.stockMovement.create({
        data: {
          productId: it.productId,
          type: 'RETURN',
          qty,
          stockAfter: p.stock,
          orderId,
          note: `Bekor qilindi #${before.number}`,
          userId: actor.userId,
          actorLabel: actor.label,
        },
      });
    }
  });
  if (actor.userId) {
    await prisma.user
      .updateMany({ where: { id: actor.userId }, data: { awaitingCancelOrderId: null, awaitingPhotoOrderId: null } })
      .catch(() => undefined);
  }
  const order = await loadOrder(orderId);
  await audit(actor, 'order.cancel', 'Order', order.id, { status: before.status }, { status: 'CANCELLED', reason: text });
  background('cancel', async () => {
    await refreshGroupMessage(order);
    await notifyCustomerStatus(order, 'CANCELLED');
    await notifyStaffCancelled(order);
  });
  return order;
}

export function isHttpError(e: unknown): e is HttpError {
  return e instanceof HttpError;
}
