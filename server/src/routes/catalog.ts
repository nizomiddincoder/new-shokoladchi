import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma, getSettings } from '../db';
import { ah, notFound } from '../lib/errors';
import { PRODUCT_INCLUDE, productDto } from '../lib/dto';
import { isWithinWorkHours } from '../lib/format';

export const catalogRouter = Router();

export function publicSettings(s: Awaited<ReturnType<typeof getSettings>>) {
  return {
    shopName: s.shopName,
    logoUrl: s.logoUrl,
    shopPhone: s.shopPhone,
    shopAddress: s.shopAddress,
    shopLat: s.shopLat,
    shopLng: s.shopLng,
    workHoursStart: s.workHoursStart,
    workHoursEnd: s.workHoursEnd,
    deliveryFee: s.deliveryFee,
    freeDeliveryFrom: s.freeDeliveryFrom,
    minOrderAmount: s.minOrderAmount,
    isOpen: isWithinWorkHours(s.workHoursStart, s.workHoursEnd),
  };
}

catalogRouter.get(
  '/settings',
  ah(async (_req, res) => {
    res.json(publicSettings(await getSettings()));
  }),
);

catalogRouter.get(
  '/home',
  ah(async (_req, res) => {
    const activeProduct: Prisma.ProductWhereInput = { isActive: true, category: { isActive: true } };
    const [banners, categories, discounted, bestsellers, newest, settings] = await Promise.all([
      prisma.banner.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }] }),
      prisma.category.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
      prisma.product.findMany({
        where: { ...activeProduct, oldPrice: { not: null } },
        include: PRODUCT_INCLUDE,
        orderBy: { updatedAt: 'desc' },
        take: 30,
      }),
      prisma.product.findMany({
        where: activeProduct,
        include: PRODUCT_INCLUDE,
        orderBy: [{ soldCount: 'desc' }, { sortOrder: 'asc' }],
        take: 10,
      }),
      prisma.product.findMany({
        where: activeProduct,
        include: PRODUCT_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      getSettings(),
    ]);
    res.json({
      banners,
      categories,
      discounted: discounted.filter((p) => p.oldPrice && p.oldPrice > p.price).slice(0, 10).map((p) => productDto(p)),
      bestsellers: bestsellers.map((p) => productDto(p)),
      newest: newest.map((p) => productDto(p)),
      settings: publicSettings(settings),
    });
  }),
);

catalogRouter.get(
  '/categories',
  ah(async (_req, res) => {
    res.json(await prisma.category.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }));
  }),
);

const listQuery = z.object({
  categoryId: z.coerce.number().int().positive().optional(),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(['popular', 'new', 'cheap', 'expensive']).default('popular'),
  discounted: z.enum(['1', 'true']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(40),
});

catalogRouter.get(
  '/products',
  ah(async (req, res) => {
    const q = listQuery.parse(req.query);
    const where: Prisma.ProductWhereInput = { isActive: true, category: { isActive: true } };
    if (q.categoryId) where.categoryId = q.categoryId;
    if (q.discounted) where.oldPrice = { not: null };
    if (q.q) {
      where.OR = [
        { nameUz: { contains: q.q, mode: 'insensitive' } },
        { nameRu: { contains: q.q, mode: 'insensitive' } },
      ];
    }
    const orderBy: Prisma.ProductOrderByWithRelationInput[] =
      q.sort === 'new'
        ? [{ createdAt: 'desc' }]
        : q.sort === 'cheap'
          ? [{ price: 'asc' }]
          : q.sort === 'expensive'
            ? [{ price: 'desc' }]
            : [{ soldCount: 'desc' }, { sortOrder: 'asc' }, { id: 'asc' }];
    const [items, total] = await Promise.all([
      prisma.product.findMany({ where, include: PRODUCT_INCLUDE, orderBy, skip: (q.page - 1) * q.limit, take: q.limit }),
      prisma.product.count({ where }),
    ]);
    res.json({ items: items.map((p) => productDto(p)), total, page: q.page, pages: Math.ceil(total / q.limit) });
  }),
);

catalogRouter.get(
  '/products/:id',
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const p = await prisma.product.findFirst({ where: { id, isActive: true }, include: PRODUCT_INCLUDE });
    if (!p) throw notFound('PRODUCT_NOT_FOUND', 'Mahsulot topilmadi');
    let isFavorite = false;
    if (req.actor?.userId) {
      isFavorite = !!(await prisma.favorite.findUnique({
        where: { userId_productId: { userId: req.actor.userId, productId: id } },
      }));
    }
    const similar = await prisma.product.findMany({
      where: { isActive: true, categoryId: p.categoryId, id: { not: p.id } },
      include: PRODUCT_INCLUDE,
      orderBy: { soldCount: 'desc' },
      take: 6,
    });
    res.json({ ...productDto(p), isFavorite, similar: similar.map((s) => productDto(s)) });
  }),
);
