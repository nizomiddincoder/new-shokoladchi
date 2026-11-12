import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { ah, badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { PRODUCT_INCLUDE, productDto, imageDto } from '../lib/dto';
import { requireTgUser } from '../lib/auth';
import { round3, toNum } from '../lib/format';
import { cancelOrder, createOrder, validateQty } from '../services/orders';
import { setMenuButtonFor } from '../bot/handlers';
import { designUpload } from '../lib/upload';
import { saveJpeg } from '../services/storage';
import { aiEnabled, cutoutSubject } from '../services/ai';

export const customerRouter = Router();
customerRouter.use(requireTgUser);

const uid = (req: Express.Request) => req.actor!.userId!;

// ---------- Profil ----------

customerRouter.patch(
  '/me',
  ah(async (req, res) => {
    const body = z
      .object({
        firstName: z.string().trim().min(1).max(60).optional(),
        lastName: z.string().trim().max(60).optional(),
        language: z.enum(['uz', 'ru']).optional(),
      })
      .parse(req.body);
    const user = await prisma.user.update({ where: { id: uid(req) }, data: body });
    if (body.language) void setMenuButtonFor(user);
    res.json({ ok: true });
  }),
);

// ---------- Savatcha ----------

async function cartResponse(userId: number) {
  const items = await prisma.cartItem.findMany({
    where: { userId },
    include: { product: { include: PRODUCT_INCLUDE } },
    orderBy: { id: 'asc' },
  });
  const list = items.map((i) => {
    const qty = toNum(i.qty);
    const product = productDto(i.product);
    const available = product.isActive && product.stock >= qty;
    return { productId: i.productId, qty, product, lineTotal: Math.round(qty * product.price), available };
  });
  return { items: list, itemsTotal: list.reduce((s, i) => s + i.lineTotal, 0) };
}

customerRouter.get('/cart', ah(async (req, res) => res.json(await cartResponse(uid(req)))));

customerRouter.put(
  '/cart/:productId',
  ah(async (req, res) => {
    const productId = Number(req.params.productId);
    const { qty } = z.object({ qty: z.number().min(0).max(100000) }).parse(req.body);
    const userId = uid(req);
    if (qty === 0) {
      await prisma.cartItem.deleteMany({ where: { userId, productId } });
      return res.json(await cartResponse(userId));
    }
    const p = await prisma.product.findFirst({ where: { id: productId, isActive: true } });
    if (!p) throw notFound('PRODUCT_NOT_FOUND', 'Mahsulot topilmadi');
    const q = round3(qty);
    if (!validateQty(q, toNum(p.step), toNum(p.minQty))) throw badRequest('BAD_QTY', 'Miqdor noto\'g\'ri');
    if (q > toNum(p.stock)) throw conflict('INSUFFICIENT_STOCK', 'Qoldiq yetarli emas', { available: toNum(p.stock) });
    await prisma.cartItem.upsert({
      where: { userId_productId: { userId, productId } },
      update: { qty: q },
      create: { userId, productId, qty: q },
    });
    res.json(await cartResponse(userId));
  }),
);

customerRouter.delete(
  '/cart',
  ah(async (req, res) => {
    await prisma.cartItem.deleteMany({ where: { userId: uid(req) } });
    res.json(await cartResponse(uid(req)));
  }),
);

// ---------- Sevimlilar ----------

customerRouter.get(
  '/favorites',
  ah(async (req, res) => {
    const favs = await prisma.favorite.findMany({
      where: { userId: uid(req), product: { isActive: true } },
      include: { product: { include: PRODUCT_INCLUDE } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(favs.map((f) => productDto(f.product)));
  }),
);

customerRouter.get(
  '/favorites/ids',
  ah(async (req, res) => {
    const favs = await prisma.favorite.findMany({ where: { userId: uid(req) }, select: { productId: true } });
    res.json(favs.map((f) => f.productId));
  }),
);

customerRouter.post(
  '/favorites/:productId',
  ah(async (req, res) => {
    const productId = Number(req.params.productId);
    const userId = uid(req);
    const existing = await prisma.favorite.findUnique({ where: { userId_productId: { userId, productId } } });
    if (existing) {
      await prisma.favorite.delete({ where: { id: existing.id } });
      return res.json({ isFavorite: false });
    }
    const p = await prisma.product.findUnique({ where: { id: productId } });
    if (!p) throw notFound();
    await prisma.favorite.create({ data: { userId, productId } });
    res.json({ isFavorite: true });
  }),
);

// ---------- Buyurtmalar ----------

const ORDER_INCLUDE = {
  items: { orderBy: { id: 'asc' as const }, include: { product: { include: { images: { orderBy: { sortOrder: 'asc' as const }, take: 1 } } } } },
};

function customerOrderDto(o: any) {
  return {
    ...o,
    items: o.items.map((i: any) => ({
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
    groupChatId: undefined,
    groupMessageId: undefined,
  };
}

customerRouter.post(
  '/orders',
  ah(async (req, res) => {
    const body = z
      .object({
        deliveryType: z.enum(['PICKUP', 'DELIVERY']),
        address: z.string().trim().max(500).optional(),
        lat: z.number().min(-90).max(90).nullable().optional(),
        lng: z.number().min(-180).max(180).nullable().optional(),
        comment: z.string().trim().max(1000).optional(),
      })
      .parse(req.body);
    const order = await createOrder(req.actor!.user!, body);
    res.status(201).json({ id: order.id, number: order.number });
  }),
);

// ---------- "Mening shokoladim" ----------

/** Mijoz tayyorlagan dizayn (shablon + rasm + matn) — yuqori sifatli JPG sifatida saqlanadi */
customerRouter.post(
  '/designs',
  designUpload.single('file'),
  ah(async (req, res) => {
    if (!req.file) throw badRequest('NO_FILE', 'Rasm topilmadi');
    const saved = await saveJpeg(req.file.buffer, 'designs', { maxSize: 4000, quality: 95 });
    res.status(201).json({ url: saved.url, width: saved.width, height: saved.height });
  }),
);

/**
 * "Mening shokoladim": AI mijoz rasmidan odamni qirqib oladi (shaffof fonli PNG).
 * Natija saqlanmaydi — to'g'ridan-to'g'ri qaytariladi, dizayn mijoz telefonida yig'iladi.
 */
const cutoutHits = new Map<number, number[]>();
const CUTOUT_LIMIT = 15; // soatiga
customerRouter.post(
  '/personal/cutout',
  designUpload.single('file'),
  ah(async (req, res) => {
    if (!req.file) throw badRequest('NO_FILE', 'Rasm topilmadi');
    if (!aiEnabled()) throw badRequest('AI_DISABLED', 'AI hozircha o\'chirilgan');
    const now = Date.now();
    const hits = (cutoutHits.get(uid(req)) || []).filter((t) => now - t < 3600_000);
    if (hits.length >= CUTOUT_LIMIT) throw badRequest('TOO_MANY', 'Juda ko\'p urinish, birozdan keyin qayta urinib ko\'ring');
    hits.push(now);
    cutoutHits.set(uid(req), hits);
    let png: Buffer;
    try {
      png = await cutoutSubject(req.file.buffer);
    } catch (e) {
      throw badRequest('CUTOUT_FAILED', (e as Error).message || 'Fonni olib tashlab bo\'lmadi');
    }
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.send(png);
  }),
);

customerRouter.post(
  '/personal-orders',
  ah(async (req, res) => {
    const body = z
      .object({
        templateId: z.number().int().positive(),
        designUrl: z.string().max(200),
        qty: z.number().positive().max(1000),
        deliveryType: z.enum(['PICKUP', 'DELIVERY']),
        address: z.string().trim().max(500).optional(),
        lat: z.number().min(-90).max(90).nullable().optional(),
        lng: z.number().min(-180).max(180).nullable().optional(),
        comment: z.string().trim().max(1000).optional(),
      })
      .parse(req.body);
    const { templateId, designUrl, qty, ...rest } = body;
    const order = await createOrder(req.actor!.user!, { ...rest, personal: { templateId, designUrl, qty } });
    res.status(201).json({ id: order.id, number: order.number });
  }),
);

customerRouter.get(
  '/orders',
  ah(async (req, res) => {
    const orders = await prisma.order.findMany({
      where: { customerId: uid(req) },
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(orders.map(customerOrderDto));
  }),
);

customerRouter.get(
  '/orders/:id',
  ah(async (req, res) => {
    const o = await prisma.order.findUnique({ where: { id: Number(req.params.id) }, include: ORDER_INCLUDE });
    if (!o) throw notFound('ORDER_NOT_FOUND', 'Buyurtma topilmadi');
    if (o.customerId !== uid(req)) throw forbidden();
    res.json(customerOrderDto(o));
  }),
);

customerRouter.post(
  '/orders/:id/cancel',
  ah(async (req, res) => {
    const { reason } = z.object({ reason: z.string().trim().min(2).max(500) }).parse(req.body);
    const id = Number(req.params.id);
    const o = await prisma.order.findUnique({ where: { id } });
    if (!o || o.customerId !== uid(req)) throw notFound('ORDER_NOT_FOUND', 'Buyurtma topilmadi');
    await cancelOrder(id, { userId: uid(req), role: 'CUSTOMER', label: req.actor!.label || 'Mijoz' }, reason);
    res.json({ ok: true });
  }),
);

customerRouter.post(
  '/orders/:id/reorder',
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const userId = uid(req);
    const o = await prisma.order.findUnique({ where: { id }, include: { items: { include: { product: true } } } });
    if (!o || o.customerId !== userId) throw notFound('ORDER_NOT_FOUND', 'Buyurtma topilmadi');
    const skipped: string[] = [];
    for (const it of o.items) {
      const p = it.product;
      // Shaxsiy rasmli shokolad qayta buyurtmada savatchaga tushmaydi (yangi dizayn kerak)
      if (it.designUrl) {
        skipped.push(it.nameSnapshot);
        continue;
      }
      const qty = round3(toNum(it.qty));
      if (!p.isActive || toNum(p.stock) < qty || !validateQty(qty, toNum(p.step), toNum(p.minQty))) {
        skipped.push(p.nameUz);
        continue;
      }
      await prisma.cartItem.upsert({
        where: { userId_productId: { userId, productId: p.id } },
        update: { qty },
        create: { userId, productId: p.id, qty },
      });
    }
    res.json({ ...(await cartResponse(userId)), skipped });
  }),
);
