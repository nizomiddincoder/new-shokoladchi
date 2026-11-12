import { Router } from 'express';
import { z } from 'zod';
import type { OrderStatus, Prisma } from '@prisma/client';
import { prisma } from '../db';
import { ah, badRequest, notFound } from '../lib/errors';
import { requireRole } from '../lib/auth';
import { imageUpload } from '../lib/upload';
import { imageDto } from '../lib/dto';
import { startOfDayTashkent, toNum } from '../lib/format';
import { saveImage } from '../services/storage';
import {
  acceptOrder,
  cancelOrder,
  courierDelivered,
  courierOnTheWay,
  courierTake,
  handOver,
  markReady,
  setFinalWeights,
  startPreparing,
  type OrderActor,
} from '../services/orders';

export const staffRouter = Router();

const actorOf = (req: Express.Request): OrderActor => ({
  userId: req.actor!.userId,
  role: req.actor!.role,
  label: req.actor!.label,
});

export const STAFF_ORDER_INCLUDE = {
  items: {
    orderBy: { id: 'asc' as const },
    include: { product: { include: { images: { orderBy: { sortOrder: 'asc' as const }, take: 1 } } } },
  },
  customer: { select: { id: true, firstName: true, lastName: true, phone: true, telegramId: true, username: true } },
  seller: { select: { id: true, firstName: true, lastName: true, phone: true } },
  courier: { select: { id: true, firstName: true, lastName: true, phone: true } },
} satisfies Prisma.OrderInclude;

export function staffOrderDto(o: Prisma.OrderGetPayload<{ include: typeof STAFF_ORDER_INCLUDE }>) {
  const { groupChatId, groupMessageId, courierMsgs, ...rest } = o;
  void groupChatId;
  void groupMessageId;
  void courierMsgs;
  return {
    ...rest,
    items: o.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      nameUz: i.nameSnapshot,
      nameRu: i.nameRuSnapshot || i.nameSnapshot,
      unit: i.unit,
      qty: toNum(i.qty),
      finalQty: i.finalQty == null ? null : toNum(i.finalQty),
      price: i.priceSnapshot,
      lineTotal: i.lineTotal,
      designUrl: i.designUrl ?? null,
      thumbUrl: i.designUrl || (i.product?.images?.[0] ? imageDto(i.product.images[0]).thumbUrl : null),
    })),
  };
}

const ACTIVE: OrderStatus[] = ['ACCEPTED', 'PREPARING', 'READY', 'ON_THE_WAY'];
const FINAL: OrderStatus[] = ['DELIVERED', 'PICKED_UP', 'CANCELLED'];

// ================= SOTUVCHI =================

const sellerOnly = requireRole('SELLER', 'ADMIN');

staffRouter.get(
  '/orders',
  sellerOnly,
  ah(async (req, res) => {
    const tab = z.enum(['new', 'mine', 'history']).default('new').parse(req.query.tab);
    const me = req.actor!.userId;
    const isAdmin = req.actor!.role === 'ADMIN';
    let where: Prisma.OrderWhereInput;
    if (tab === 'new') where = { status: 'NEW' };
    else if (tab === 'mine') where = { status: { in: ACTIVE }, ...(isAdmin ? {} : { sellerId: me }) };
    else where = { status: { in: FINAL }, ...(isAdmin ? {} : { sellerId: me }) };
    const orders = await prisma.order.findMany({
      where,
      include: STAFF_ORDER_INCLUDE,
      orderBy: { createdAt: tab === 'new' ? 'asc' : 'desc' },
      take: 100,
    });
    res.json(orders.map(staffOrderDto));
  }),
);

staffRouter.get(
  '/orders/:id',
  requireRole('SELLER', 'COURIER', 'ADMIN'),
  ah(async (req, res) => {
    const o = await prisma.order.findUnique({ where: { id: Number(req.params.id) }, include: STAFF_ORDER_INCLUDE });
    if (!o) throw notFound('ORDER_NOT_FOUND', 'Buyurtma topilmadi');
    if (req.actor!.role === 'COURIER') {
      const canSee = o.courierId === req.actor!.userId || (o.status === 'READY' && o.deliveryType === 'DELIVERY' && !o.courierId);
      if (!canSee) throw notFound('ORDER_NOT_FOUND', 'Buyurtma topilmadi');
    }
    res.json(staffOrderDto(o));
  }),
);

staffRouter.get(
  '/stats/today',
  requireRole('SELLER', 'COURIER', 'ADMIN'),
  ah(async (req, res) => {
    const since = startOfDayTashkent();
    const me = req.actor!.userId;
    if (req.actor!.role === 'COURIER') {
      const [delivered, active] = await Promise.all([
        prisma.order.count({ where: { courierId: me, status: 'DELIVERED', deliveredAt: { gte: since } } }),
        prisma.order.count({ where: { courierId: me, status: { in: ['READY', 'ON_THE_WAY'] } } }),
      ]);
      const sum = await prisma.order.aggregate({
        where: { courierId: me, status: 'DELIVERED', deliveredAt: { gte: since } },
        _sum: { finalTotal: true },
      });
      return res.json({ delivered, active, total: sum._sum.finalTotal || 0 });
    }
    const where: Prisma.OrderWhereInput = { acceptedAt: { gte: since }, ...(req.actor!.role === 'ADMIN' ? {} : { sellerId: me }) };
    const [count, completed, cancelled, sum] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.count({ where: { ...where, status: { in: ['DELIVERED', 'PICKED_UP'] } } }),
      prisma.order.count({ where: { ...where, status: 'CANCELLED' } }),
      prisma.order.aggregate({ where: { ...where, status: { not: 'CANCELLED' } }, _sum: { finalTotal: true } }),
    ]);
    res.json({ count, completed, cancelled, total: sum._sum.finalTotal || 0 });
  }),
);

const idParam = (req: Express.Request & { params: Record<string, string> }) => Number(req.params.id);

staffRouter.post('/orders/:id/accept', sellerOnly, ah(async (req, res) => res.json({ id: (await acceptOrder(idParam(req), actorOf(req))).id })));
staffRouter.post('/orders/:id/prepare', sellerOnly, ah(async (req, res) => res.json({ id: (await startPreparing(idParam(req), actorOf(req))).id })));
staffRouter.post('/orders/:id/handover', sellerOnly, ah(async (req, res) => res.json({ id: (await handOver(idParam(req), actorOf(req))).id })));

staffRouter.post(
  '/orders/:id/weights',
  sellerOnly,
  ah(async (req, res) => {
    const { items } = z
      .object({ items: z.array(z.object({ itemId: z.number().int(), finalQty: z.number().positive().max(100000) })).min(1) })
      .parse(req.body);
    const o = await setFinalWeights(idParam(req), actorOf(req), items);
    res.json({ id: o.id, finalTotal: o.finalTotal });
  }),
);

staffRouter.post(
  '/orders/:id/ready',
  sellerOnly,
  imageUpload.single('photo'),
  ah(async (req, res) => {
    if (!req.file) throw badRequest('PHOTO_REQUIRED', 'Tayyor buyurtma rasmi majburiy');
    const saved = await saveImage(req.file.buffer, 'orders');
    const o = await markReady(idParam(req), actorOf(req), saved.url);
    res.json({ id: o.id });
  }),
);

staffRouter.post(
  '/orders/:id/cancel',
  requireRole('SELLER', 'ADMIN'),
  ah(async (req, res) => {
    const { reason } = z.object({ reason: z.string().trim().min(2).max(500) }).parse(req.body);
    const o = await cancelOrder(idParam(req), actorOf(req), reason);
    res.json({ id: o.id });
  }),
);

// ================= KURYER =================

const courierOnly = requireRole('COURIER', 'ADMIN');

staffRouter.get(
  '/courier/orders',
  courierOnly,
  ah(async (req, res) => {
    const tab = z.enum(['available', 'active', 'done']).default('active').parse(req.query.tab);
    const me = req.actor!.userId;
    const isAdmin = req.actor!.role === 'ADMIN';
    let where: Prisma.OrderWhereInput;
    if (tab === 'available') where = { status: 'READY', deliveryType: 'DELIVERY', courierId: null };
    else if (tab === 'active') where = { status: { in: ['READY', 'ON_THE_WAY'] }, ...(isAdmin ? { courierId: { not: null } } : { courierId: me }) };
    else where = { status: 'DELIVERED', ...(isAdmin ? {} : { courierId: me }) };
    const orders = await prisma.order.findMany({
      where,
      include: STAFF_ORDER_INCLUDE,
      orderBy: { readyAt: tab === 'done' ? 'desc' : 'asc' },
      take: 100,
    });
    res.json(orders.map(staffOrderDto));
  }),
);

staffRouter.post('/courier/orders/:id/take', courierOnly, ah(async (req, res) => res.json({ id: (await courierTake(idParam(req), actorOf(req))).id })));
staffRouter.post('/courier/orders/:id/on-the-way', courierOnly, ah(async (req, res) => res.json({ id: (await courierOnTheWay(idParam(req), actorOf(req))).id })));
staffRouter.post('/courier/orders/:id/delivered', courierOnly, ah(async (req, res) => res.json({ id: (await courierDelivered(idParam(req), actorOf(req))).id })));
