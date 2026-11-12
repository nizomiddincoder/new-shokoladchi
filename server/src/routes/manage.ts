import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { ah, badRequest, notFound } from '../lib/errors';
import { requireRole } from '../lib/auth';
import { audit } from '../lib/audit';
import { imageUpload } from '../lib/upload';
import { PRODUCT_INCLUDE, imageDto, productDto } from '../lib/dto';
import { round3, toNum } from '../lib/format';
import { saveImage, removeUpload } from '../services/storage';
import { enqueueAi } from '../services/ai';

/** Mahsulot, rasm va ombor boshqaruvi: SELLER, WAREHOUSE, ADMIN */
export const manageRouter = Router();
const productRoles = requireRole('SELLER', 'WAREHOUSE', 'ADMIN');
const stockRoles = requireRole('WAREHOUSE', 'ADMIN');

// ---------- Kategoriyalar (forma uchun) ----------
manageRouter.get(
  '/categories',
  productRoles,
  ah(async (_req, res) => {
    res.json(await prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }));
  }),
);

// ---------- Mahsulotlar ----------
const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  status: z.enum(['all', 'active', 'inactive', 'low', 'out']).default('all'),
  sort: z.enum(['sort', 'name', 'stock', 'new', 'price']).default('sort'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

manageRouter.get(
  '/products',
  productRoles,
  ah(async (req, res) => {
    const q = listQuery.parse(req.query);
    const where: Prisma.ProductWhereInput = {};
    if (q.categoryId) where.categoryId = q.categoryId;
    if (q.status === 'active') where.isActive = true;
    if (q.status === 'inactive') where.isActive = false;
    if (q.status === 'out') where.stock = { lte: 0 };
    if (q.q) {
      const n = Number(q.q);
      where.OR = [
        { nameUz: { contains: q.q, mode: 'insensitive' } },
        { nameRu: { contains: q.q, mode: 'insensitive' } },
        ...(Number.isInteger(n) && n > 0 ? [{ id: n }] : []),
      ];
    }
    if (q.status === 'low') {
      const ids = await prisma.$queryRaw<{ id: number }[]>`SELECT id FROM "Product" WHERE stock <= "lowStockThreshold"`;
      where.id = { in: ids.map((i) => i.id) };
    }
    const orderBy: Prisma.ProductOrderByWithRelationInput[] =
      q.sort === 'name'
        ? [{ nameUz: 'asc' }]
        : q.sort === 'stock'
          ? [{ stock: 'asc' }]
          : q.sort === 'new'
            ? [{ createdAt: 'desc' }]
            : q.sort === 'price'
              ? [{ price: 'asc' }]
              : [{ categoryId: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }];
    const [items, total] = await Promise.all([
      prisma.product.findMany({ where, include: PRODUCT_INCLUDE, orderBy, skip: (q.page - 1) * q.limit, take: q.limit }),
      prisma.product.count({ where }),
    ]);
    res.json({ items: items.map((p) => productDto(p, { staff: true })), total, page: q.page, pages: Math.ceil(total / q.limit) });
  }),
);

manageRouter.get(
  '/products/:id',
  productRoles,
  ah(async (req, res) => {
    const p = await prisma.product.findUnique({ where: { id: Number(req.params.id) }, include: PRODUCT_INCLUDE });
    if (!p) throw notFound('PRODUCT_NOT_FOUND', 'Mahsulot topilmadi');
    res.json(productDto(p, { staff: true }));
  }),
);

const productBody = z
  .object({
    nameUz: z.string().trim().min(1).max(200),
    nameRu: z.string().trim().min(1).max(200),
    descriptionUz: z.string().trim().max(3000).default(''),
    descriptionRu: z.string().trim().max(3000).default(''),
    categoryId: z.number().int().positive(),
    price: z.number().int().min(0).max(1_000_000_000),
    oldPrice: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
    unit: z.enum(['PIECE', 'KG', 'GRAM', 'LITER', 'BOX', 'PACK']),
    step: z.number().positive().max(100000),
    minQty: z.number().positive().max(100000),
    lowStockThreshold: z.number().min(0).max(1_000_000).default(0),
    isActive: z.boolean().default(true),
    sortOrder: z.number().int().default(0),
    imageIds: z.array(z.number().int()).max(5).default([]),
    initialStock: z.number().min(0).max(10_000_000).optional(),
  })
  .refine((b) => !b.oldPrice || b.oldPrice > b.price, { message: 'Eski narx joriy narxdan katta bo\'lishi kerak', path: ['oldPrice'] });

async function attachImages(tx: Prisma.TransactionClient, productId: number, imageIds: number[]) {
  const imgs = await tx.productImage.findMany({ where: { id: { in: imageIds } } });
  const valid = imgs.filter((i) => i.productId === null || i.productId === productId);
  if (valid.length !== imageIds.length) throw badRequest('BAD_IMAGES', 'Rasmlar noto\'g\'ri');
  const removed = await tx.productImage.findMany({ where: { productId, id: { notIn: imageIds } } });
  await tx.productImage.deleteMany({ where: { productId, id: { notIn: imageIds } } });
  for (const [i, id] of imageIds.entries()) {
    await tx.productImage.update({ where: { id }, data: { productId, sortOrder: i } });
  }
  return removed;
}

manageRouter.post(
  '/products',
  productRoles,
  ah(async (req, res) => {
    const body = productBody.parse(req.body);
    const { imageIds, initialStock, ...data } = body;
    const cat = await prisma.category.findUnique({ where: { id: data.categoryId } });
    if (!cat) throw badRequest('BAD_CATEGORY', 'Kategoriya topilmadi');
    const actor = req.actor!;
    const created = await prisma.$transaction(async (tx) => {
      const p = await tx.product.create({
        data: {
          ...data,
          oldPrice: data.oldPrice || null,
          stock: round3(initialStock || 0),
          createdById: actor.userId,
          updatedById: actor.userId,
        },
      });
      await attachImages(tx, p.id, imageIds);
      if (initialStock && initialStock > 0) {
        await tx.stockMovement.create({
          data: {
            productId: p.id,
            type: 'IN',
            qty: round3(initialStock),
            stockAfter: round3(initialStock),
            note: 'Boshlang\'ich qoldiq',
            userId: actor.userId,
            actorLabel: actor.label,
          },
        });
      }
      return p;
    });
    const full = await prisma.product.findUniqueOrThrow({ where: { id: created.id }, include: PRODUCT_INCLUDE });
    await audit(actor, 'product.create', 'Product', created.id, null, data);
    res.status(201).json(productDto(full, { staff: true }));
  }),
);

manageRouter.patch(
  '/products/:id',
  productRoles,
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const before = await prisma.product.findUnique({ where: { id } });
    if (!before) throw notFound('PRODUCT_NOT_FOUND', 'Mahsulot topilmadi');
    const body = productBody.parse(req.body);
    const { imageIds, initialStock, ...data } = body;
    void initialStock;
    const actor = req.actor!;
    const removed = await prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id }, data: { ...data, oldPrice: data.oldPrice || null, updatedById: actor.userId } });
      return attachImages(tx, id, imageIds);
    });
    for (const r of removed) await removeUpload(r.originalUrl, r.originalThumb, r.aiUrl, r.aiThumb);
    const full = await prisma.product.findUniqueOrThrow({ where: { id }, include: PRODUCT_INCLUDE });
    const { stock, soldCount, ...beforeRest } = before;
    void stock;
    void soldCount;
    await audit(actor, 'product.update', 'Product', id, beforeRest, data);
    res.json(productDto(full, { staff: true }));
  }),
);

manageRouter.post(
  '/products/:id/active',
  productRoles,
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
    await prisma.product.update({ where: { id }, data: { isActive, updatedById: req.actor!.userId } });
    await audit(req.actor!, isActive ? 'product.activate' : 'product.deactivate', 'Product', id);
    res.json({ ok: true });
  }),
);

manageRouter.delete(
  '/products/:id',
  requireRole('ADMIN'),
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const p = await prisma.product.findUnique({ where: { id }, include: { images: true } });
    if (!p) throw notFound();
    const used = await prisma.orderItem.count({ where: { productId: id } });
    if (used > 0) {
      await prisma.product.update({ where: { id }, data: { isActive: false } });
      await audit(req.actor!, 'product.deactivate', 'Product', id, null, { reason: 'has orders' });
      return res.json({ ok: true, deactivated: true });
    }
    await prisma.product.delete({ where: { id } });
    for (const i of p.images) await removeUpload(i.originalUrl, i.originalThumb, i.aiUrl, i.aiThumb);
    await audit(req.actor!, 'product.delete', 'Product', id, { nameUz: p.nameUz }, null);
    res.json({ ok: true, deleted: true });
  }),
);

// ---------- Rasmlar (AI bilan) ----------
manageRouter.post(
  '/images',
  productRoles,
  imageUpload.single('file'),
  ah(async (req, res) => {
    if (!req.file) throw badRequest('NO_FILE', 'Rasm tanlanmagan');
    const saved = await saveImage(req.file.buffer, 'products');
    const img = await prisma.productImage.create({
      data: { originalUrl: saved.url, originalThumb: saved.thumbUrl, aiStatus: 'PENDING' },
    });
    await enqueueAi(img.id);
    const fresh = await prisma.productImage.findUniqueOrThrow({ where: { id: img.id } });
    res.status(201).json(imageDto(fresh));
  }),
);

manageRouter.get(
  '/images/:id',
  productRoles,
  ah(async (req, res) => {
    const img = await prisma.productImage.findUnique({ where: { id: Number(req.params.id) } });
    if (!img) throw notFound();
    res.json(imageDto(img));
  }),
);

manageRouter.post(
  '/images/:id/regenerate',
  productRoles,
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const img = await prisma.productImage.findUnique({ where: { id } });
    if (!img) throw notFound();
    await prisma.productImage.update({ where: { id }, data: { useAi: true } });
    await enqueueAi(id);
    res.json(imageDto(await prisma.productImage.findUniqueOrThrow({ where: { id } })));
  }),
);

manageRouter.patch(
  '/images/:id',
  productRoles,
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const { useAi } = z.object({ useAi: z.boolean() }).parse(req.body);
    const img = await prisma.productImage.update({ where: { id }, data: { useAi } });
    res.json(imageDto(img));
  }),
);

// ---------- Ombor ----------
manageRouter.post(
  '/stock/movements',
  stockRoles,
  ah(async (req, res) => {
    const body = z
      .object({
        productId: z.number().int().positive(),
        type: z.enum(['IN', 'OUT', 'ADJUST']),
        qty: z.number().min(0).max(10_000_000),
        note: z.string().trim().min(2, 'Sabab majburiy').max(500),
      })
      .parse(req.body);
    const actor = req.actor!;
    const result = await prisma.$transaction(async (tx) => {
      const p = await tx.product.findUnique({ where: { id: body.productId } });
      if (!p) throw notFound('PRODUCT_NOT_FOUND', 'Mahsulot topilmadi');
      const current = toNum(p.stock);
      const qty = round3(body.qty);
      let delta: number;
      if (body.type === 'IN') delta = qty;
      else if (body.type === 'OUT') {
        if (qty > current) throw badRequest('INSUFFICIENT_STOCK', `Omborda faqat ${current} bor`);
        delta = -qty;
      } else delta = round3(qty - current); // ADJUST: qty = haqiqiy qoldiq
      if (body.type !== 'ADJUST' && qty <= 0) throw badRequest('BAD_QTY', 'Miqdor 0 dan katta bo\'lishi kerak');
      const updated = await tx.product.update({
        where: { id: p.id },
        data: { stock: { increment: delta } },
        select: { stock: true },
      });
      const mv = await tx.stockMovement.create({
        data: {
          productId: p.id,
          type: body.type,
          qty: delta,
          stockAfter: updated.stock,
          note: body.note,
          userId: actor.userId,
          actorLabel: actor.label,
        },
      });
      return { movement: mv, stock: toNum(updated.stock), before: current };
    });
    await audit(actor, `stock.${body.type.toLowerCase()}`, 'Product', body.productId, { stock: result.before }, { stock: result.stock, note: body.note });
    res.status(201).json(result);
  }),
);

manageRouter.get(
  '/stock/movements',
  stockRoles,
  ah(async (req, res) => {
    const q = z
      .object({
        productId: z.coerce.number().int().positive().optional(),
        type: z.enum(['IN', 'OUT', 'ORDER', 'ADJUST', 'RETURN']).optional(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      })
      .parse(req.query);
    const where: Prisma.StockMovementWhereInput = {};
    if (q.productId) where.productId = q.productId;
    if (q.type) where.type = q.type;
    if (q.from || q.to) where.createdAt = { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) };
    const [items, total] = await Promise.all([
      prisma.stockMovement.findMany({
        where,
        include: { product: { select: { id: true, nameUz: true, nameRu: true, unit: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      prisma.stockMovement.count({ where }),
    ]);
    res.json({ items, total, page: q.page, pages: Math.ceil(total / q.limit) });
  }),
);

manageRouter.get(
  '/stock/low',
  stockRoles,
  ah(async (_req, res) => {
    const ids = await prisma.$queryRaw<{ id: number }[]>`SELECT id FROM "Product" WHERE stock <= "lowStockThreshold" AND "isActive" = true`;
    const items = await prisma.product.findMany({
      where: { id: { in: ids.map((i) => i.id) } },
      include: PRODUCT_INCLUDE,
      orderBy: { stock: 'asc' },
    });
    res.json(items.map((p) => productDto(p, { staff: true })));
  }),
);

manageRouter.get(
  '/stock/low/count',
  productRoles,
  ah(async (_req, res) => {
    const r = await prisma.$queryRaw<{ c: bigint }[]>`SELECT COUNT(*)::bigint AS c FROM "Product" WHERE stock <= "lowStockThreshold" AND "isActive" = true`;
    res.json({ count: Number(r[0]?.c || 0) });
  }),
);
