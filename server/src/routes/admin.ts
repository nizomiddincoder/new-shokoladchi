import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { InputFile } from 'grammy';
import { prisma, getSettings } from '../db';
import { ah, badRequest, forbidden, notFound } from '../lib/errors';
import { requireRole, isEnvAdmin } from '../lib/auth';
import { audit } from '../lib/audit';
import { excelUpload, imageUpload } from '../lib/upload';
import { buildProductsWorkbook, importProducts } from '../services/productExcel';
import { escapeHtml, toNum } from '../lib/format';
import { STAFF_ORDER_INCLUDE, staffOrderDto } from './staff';
import { removeUpload, saveImage, saveJpeg, type Folder } from '../services/storage';
import { dashboardStats, resolveRange } from '../services/stats';
import { buildExport, type ExportType } from '../services/export';
import { aiEnabled, aiMonthlyStats, enqueueCategoryImage, generateBanner } from '../services/ai';
import { guessCategoryIcon } from '../lib/categoryIcon';
import { enqueueTranslation } from '../services/translate';
import { runBroadcasts, segmentWhere } from '../services/broadcast';
import { bot, safeCall } from '../bot/instance';
import { setMenuButtonFor } from '../bot/handlers';

export const adminRouter = Router();
adminRouter.use(requireRole('ADMIN'));

const page = z.coerce.number().int().min(1).default(1);

// ================= DASHBOARD =================
adminRouter.get(
  '/dashboard',
  ah(async (req, res) => {
    const q = z
      .object({ preset: z.enum(['today', '7d', '30d', 'custom']).default('today'), from: z.string().optional(), to: z.string().optional() })
      .parse(req.query);
    const { start, end } = resolveRange(q.preset, q.from, q.to);
    res.json(await dashboardStats(start, end));
  }),
);

// ================= BUYURTMALAR =================
adminRouter.get(
  '/orders',
  ah(async (req, res) => {
    const q = z
      .object({
        status: z.enum(['NEW', 'ACCEPTED', 'PREPARING', 'READY', 'ON_THE_WAY', 'DELIVERED', 'PICKED_UP', 'CANCELLED', 'ACTIVE']).optional(),
        deliveryType: z.enum(['PICKUP', 'DELIVERY']).optional(),
        sellerId: z.coerce.number().int().optional(),
        customerId: z.coerce.number().int().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        q: z.string().trim().max(50).optional(),
        page,
        limit: z.coerce.number().int().min(1).max(200).default(30),
      })
      .parse(req.query);
    const where: Prisma.OrderWhereInput = {};
    if (q.status === 'ACTIVE') where.status = { in: ['NEW', 'ACCEPTED', 'PREPARING', 'READY', 'ON_THE_WAY'] };
    else if (q.status) where.status = q.status;
    if (q.deliveryType) where.deliveryType = q.deliveryType;
    if (q.sellerId) where.sellerId = q.sellerId;
    if (q.customerId) where.customerId = q.customerId;
    if (q.from || q.to) {
      const { start, end } = resolveRange('custom', q.from || q.to, q.to || q.from);
      where.createdAt = { gte: start, lt: end };
    }
    if (q.q) {
      const digits = q.q.replace(/\D/g, '');
      const num = Number(q.q.replace('#', ''));
      where.OR = [
        ...(Number.isInteger(num) && num > 0 && num < 2_000_000_000 ? [{ number: num }] : []),
        ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
        { customer: { firstName: { contains: q.q, mode: 'insensitive' as const } } },
      ];
    }
    const [items, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: STAFF_ORDER_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      prisma.order.count({ where }),
    ]);
    res.json({ items: items.map(staffOrderDto), total, page: q.page, pages: Math.ceil(total / q.limit) });
  }),
);

adminRouter.get(
  '/orders/:id',
  ah(async (req, res) => {
    const o = await prisma.order.findUnique({ where: { id: Number(req.params.id) }, include: STAFF_ORDER_INCLUDE });
    if (!o) throw notFound('ORDER_NOT_FOUND', 'Buyurtma topilmadi');
    const history = await prisma.auditLog.findMany({
      where: { entity: 'Order', entityId: String(o.id) },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ ...staffOrderDto(o), history });
  }),
);

// ================= MIJOZLAR =================
adminRouter.get(
  '/customers',
  ah(async (req, res) => {
    const q = z
      .object({ q: z.string().trim().max(60).optional(), page, limit: z.coerce.number().int().min(1).max(200).default(30), blocked: z.enum(['1']).optional() })
      .parse(req.query);
    const where: Prisma.UserWhereInput = { role: 'CUSTOMER' };
    if (q.blocked) where.isBlocked = true;
    if (q.q) {
      const digits = q.q.replace(/\D/g, '');
      where.OR = [
        { firstName: { contains: q.q, mode: 'insensitive' } },
        { lastName: { contains: q.q, mode: 'insensitive' } },
        ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
      ];
    }
    const [users, total] = await Promise.all([
      prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.limit, take: q.limit }),
      prisma.user.count({ where }),
    ]);
    const agg = await prisma.order.groupBy({
      by: ['customerId'],
      where: { customerId: { in: users.map((u) => u.id) }, status: { not: 'CANCELLED' } },
      _count: { _all: true },
      _sum: { finalTotal: true },
      _max: { createdAt: true },
    });
    const map = new Map(agg.map((a) => [a.customerId, a]));
    res.json({
      items: users.map((u) => ({
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        phone: u.phone,
        username: u.username,
        language: u.language,
        isBlocked: u.isBlocked,
        botBlocked: u.botBlocked,
        regStep: u.regStep,
        createdAt: u.createdAt,
        ordersCount: map.get(u.id)?._count._all || 0,
        totalSpent: map.get(u.id)?._sum.finalTotal || 0,
        lastOrderAt: map.get(u.id)?._max.createdAt || null,
      })),
      total,
      page: q.page,
      pages: Math.ceil(total / q.limit),
    });
  }),
);

adminRouter.get(
  '/customers/:id',
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const u = await prisma.user.findUnique({ where: { id } });
    if (!u) throw notFound();
    const orders = await prisma.order.findMany({
      where: { customerId: id },
      include: STAFF_ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    const done = orders.filter((o) => o.status === 'DELIVERED' || o.status === 'PICKED_UP');
    res.json({
      user: u,
      stats: {
        orders: orders.length,
        completed: done.length,
        cancelled: orders.filter((o) => o.status === 'CANCELLED').length,
        totalSpent: done.reduce((s, o) => s + o.finalTotal, 0),
      },
      orders: orders.map(staffOrderDto),
    });
  }),
);

adminRouter.post(
  '/users/:id/block',
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const { blocked } = z.object({ blocked: z.boolean() }).parse(req.body);
    const u = await prisma.user.findUnique({ where: { id } });
    if (!u) throw notFound();
    if (isEnvAdmin(u.telegramId)) throw forbidden('CANNOT_BLOCK_ADMIN', 'Asosiy adminni bloklab bo\'lmaydi');
    const updated = await prisma.user.update({ where: { id }, data: { isBlocked: blocked } });
    await audit(req.actor!, blocked ? 'user.block' : 'user.unblock', 'User', id, { isBlocked: u.isBlocked }, { isBlocked: blocked });
    void setMenuButtonFor(updated);
    res.json({ ok: true });
  }),
);

// ================= KATEGORIYALAR =================
const categoryBody = z.object({
  nameUz: z.string().trim().min(1).max(100),
  // Ixtiyoriy: yuborilmasa avtomatik tarjima qilinadi
  nameRu: z.string().trim().max(100).optional(),
  // 'auto' yoki yuborilmasa — nomga qarab avtomatik tanlanadi
  iconName: z.string().trim().min(1).max(50).optional(),
  // Yuklangan rasm; null/yo'q bo'lsa AI nomiga mos rasm yaratadi
  imageUrl: z.string().startsWith('/uploads/').nullable().optional(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

adminRouter.get(
  '/categories',
  ah(async (_req, res) => {
    const cats = await prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: { _count: { select: { products: true } } },
    });
    res.json(cats);
  }),
);

adminRouter.post(
  '/categories',
  ah(async (req, res) => {
    const data = categoryBody.parse(req.body);
    const auto = !data.nameRu;
    const iconName = !data.iconName || data.iconName === 'auto' ? guessCategoryIcon(data.nameUz) : data.iconName;
    let c = await prisma.category.create({
      data: { ...data, iconName, imageUrl: data.imageUrl || null, nameRu: data.nameRu || data.nameUz },
    });
    if (auto) enqueueTranslation('category', c.id);
    // Rasm yuklanmagan bo'lsa — AI nomiga mos rasm yaratadi
    if (!c.imageUrl && (await enqueueCategoryImage(c.id))) c = { ...c, imageStatus: 'PENDING' };
    await audit(req.actor!, 'category.create', 'Category', c.id, null, data);
    res.status(201).json(c);
  }),
);

adminRouter.patch(
  '/categories/:id',
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const before = await prisma.category.findUnique({ where: { id } });
    if (!before) throw notFound();
    const data = categoryBody.partial().parse(req.body);
    const auto = !data.nameRu && !!data.nameUz && data.nameUz !== before.nameUz;
    if (!data.nameRu) delete data.nameRu;
    if (auto && !aiEnabled()) data.nameRu = data.nameUz;
    if (data.iconName === 'auto') data.iconName = guessCategoryIcon(data.nameUz ?? before.nameUz);
    const imageChanged = data.imageUrl !== undefined && data.imageUrl !== before.imageUrl;
    const update: Prisma.CategoryUpdateInput = { ...data };
    // Qo'lda yuklangan rasm AI jarayonini to'xtatadi
    if (imageChanged && data.imageUrl) update.imageStatus = 'NONE';
    let c = await prisma.category.update({ where: { id }, data: update });
    if (auto) enqueueTranslation('category', id);
    if (imageChanged && before.imageUrl?.startsWith('/uploads/categories/')) await removeUpload(before.imageUrl);
    // Rasm olib tashlansa — AI nomga mos yangisini yaratadi
    if (imageChanged && !data.imageUrl && (await enqueueCategoryImage(id))) c = { ...c, imageStatus: 'PENDING' };
    await audit(req.actor!, 'category.update', 'Category', id, before, data);
    res.json(c);
  }),
);

/** Kategoriya rasmini AI bilan (qayta) yaratish */
adminRouter.post(
  '/categories/:id/ai-image',
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const c = await prisma.category.findUnique({ where: { id } });
    if (!c) throw notFound();
    if (!(await enqueueCategoryImage(id))) throw badRequest('AI_DISABLED', 'AI o\'chirilgan: GEMINI_API_KEY o\'rnatilmagan');
    await audit(req.actor!, 'category.ai_image', 'Category', id);
    res.json({ ok: true, imageStatus: 'PENDING' });
  }),
);

adminRouter.delete(
  '/categories/:id',
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const count = await prisma.product.count({ where: { categoryId: id } });
    if (count > 0) throw badRequest('CATEGORY_NOT_EMPTY', `Kategoriyada ${count} ta mahsulot bor. Avval ularni ko'chiring yoki kategoriyani nofaol qiling.`);
    const before = await prisma.category.delete({ where: { id } });
    await audit(req.actor!, 'category.delete', 'Category', id, before, null);
    res.json({ ok: true });
  }),
);

adminRouter.post(
  '/categories/reorder',
  ah(async (req, res) => {
    const { ids } = z.object({ ids: z.array(z.number().int()) }).parse(req.body);
    await prisma.$transaction(ids.map((id, i) => prisma.category.update({ where: { id }, data: { sortOrder: i } })));
    await audit(req.actor!, 'category.reorder', 'Category', null, null, { ids });
    res.json({ ok: true });
  }),
);

// ================= MAHSULOTLAR: ommaviy amallar =================
adminRouter.post(
  '/products/bulk-price',
  ah(async (req, res) => {
    const body = z
      .object({
        productIds: z.array(z.number().int()).optional(),
        categoryId: z.number().int().optional(),
        mode: z.enum(['percent', 'fixed', 'set']),
        value: z.number(),
        keepOldPrice: z.boolean().default(false),
      })
      .parse(req.body);
    if (!body.productIds?.length && !body.categoryId) throw badRequest('NO_TARGET', 'Mahsulotlar yoki kategoriya tanlanmagan');
    const where: Prisma.ProductWhereInput = body.productIds?.length ? { id: { in: body.productIds } } : { categoryId: body.categoryId };
    const products = await prisma.product.findMany({ where });
    const changes: { id: number; from: number; to: number }[] = [];
    await prisma.$transaction(async (tx) => {
      for (const p of products) {
        let price = p.price;
        if (body.mode === 'percent') price = Math.round((p.price * (100 + body.value)) / 100);
        else if (body.mode === 'fixed') price = p.price + Math.round(body.value);
        else price = Math.round(body.value);
        price = Math.max(0, Math.round(price / 100) * 100);
        if (price === p.price) continue;
        const oldPrice = body.keepOldPrice && price < p.price ? p.price : p.oldPrice && p.oldPrice > price ? p.oldPrice : null;
        await tx.product.update({ where: { id: p.id }, data: { price, oldPrice, updatedById: req.actor!.userId } });
        changes.push({ id: p.id, from: p.price, to: price });
      }
    });
    await audit(req.actor!, 'product.bulk_price', 'Product', null, null, { ...body, changes });
    res.json({ updated: changes.length, changes });
  }),
);

adminRouter.post(
  '/products/reorder',
  ah(async (req, res) => {
    const { ids } = z.object({ ids: z.array(z.number().int()) }).parse(req.body);
    await prisma.$transaction(ids.map((id, i) => prisma.product.update({ where: { id }, data: { sortOrder: i } })));
    res.json({ ok: true });
  }),
);

// ---------- Excel: bir tugma bilan yuklab olish va import ----------
adminRouter.get(
  '/products/excel',
  ah(async (req, res) => {
    const { buffer, filename } = await buildProductsWorkbook();
    await audit(req.actor!, 'export', 'products-excel', null);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }),
);

adminRouter.post(
  '/products/excel/send',
  ah(async (req, res) => {
    const user = req.actor!.user;
    if (!user) throw badRequest('TG_ONLY', 'Faqat Telegram orqali');
    const { buffer, filename } = await buildProductsWorkbook();
    const r = await safeCall(user.telegramId, () => bot.api.sendDocument(String(user.telegramId), new InputFile(buffer, filename), { caption: filename }));
    if (!r.ok) throw badRequest('SEND_FAILED', 'Fayl yuborilmadi: ' + r.error);
    res.json({ ok: true, filename });
  }),
);

adminRouter.post(
  '/products/import',
  excelUpload.single('file'),
  ah(async (req, res) => {
    if (!req.file) throw badRequest('NO_FILE', 'Excel fayl tanlanmagan');
    try {
      res.json(await importProducts(req.file.buffer, req.actor!));
    } catch (e) {
      throw badRequest('IMPORT_FAILED', (e as Error).message);
    }
  }),
);

// ================= XODIMLAR =================
const STAFF_ROLES = ['SELLER', 'WAREHOUSE', 'ADMIN'] as const;

adminRouter.get(
  '/staff',
  ah(async (_req, res) => {
    const users = await prisma.user.findMany({
      where: { role: { in: [...STAFF_ROLES] } },
      orderBy: [{ role: 'asc' }, { firstName: 'asc' }],
    });
    const [sellerAgg, deliveredAgg] = await Promise.all([
      prisma.order.groupBy({ by: ['sellerId'], where: { sellerId: { not: null } }, _count: { _all: true } }),
      prisma.order.groupBy({ by: ['sellerId'], where: { sellerId: { not: null }, status: 'DELIVERED' }, _count: { _all: true } }),
    ]);
    res.json(
      users.map((u) => ({
        id: u.id,
        telegramId: u.telegramId,
        firstName: u.firstName,
        lastName: u.lastName,
        phone: u.phone,
        username: u.username,
        role: u.role,
        isBlocked: u.isBlocked,
        isMainAdmin: isEnvAdmin(u.telegramId),
        createdAt: u.createdAt,
        ordersAccepted: sellerAgg.find((a) => a.sellerId === u.id)?._count._all || 0,
        ordersDelivered: deliveredAgg.find((a) => a.sellerId === u.id)?._count._all || 0,
      })),
    );
  }),
);

adminRouter.get(
  '/staff/:id/stats',
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const q = z.object({ preset: z.enum(['today', '7d', '30d', 'custom']).default('30d'), from: z.string().optional(), to: z.string().optional() }).parse(req.query);
    const { start, end } = resolveRange(q.preset, q.from, q.to);
    const u = await prisma.user.findUnique({ where: { id } });
    if (!u) throw notFound();
    const range = { gte: start, lt: end };
    const [accepted, completedSeller, cancelledSeller, revenue, delivered, movements, productsCreated] = await Promise.all([
      prisma.order.count({ where: { sellerId: id, acceptedAt: range } }),
      prisma.order.count({ where: { sellerId: id, acceptedAt: range, status: { in: ['DELIVERED', 'PICKED_UP'] } } }),
      prisma.order.count({ where: { sellerId: id, acceptedAt: range, status: 'CANCELLED' } }),
      prisma.order.aggregate({ where: { sellerId: id, acceptedAt: range, status: { in: ['DELIVERED', 'PICKED_UP'] } }, _sum: { finalTotal: true } }),
      prisma.order.count({ where: { sellerId: id, status: 'DELIVERED', deliveredAt: range } }),
      prisma.stockMovement.count({ where: { userId: id, createdAt: range, type: { in: ['IN', 'OUT', 'ADJUST'] } } }),
      prisma.product.count({ where: { createdById: id, createdAt: range } }),
    ]);
    const timing = await prisma.$queryRaw<{ accept: number | null; delivery: number | null }[]>`
      SELECT
        (SELECT AVG(EXTRACT(EPOCH FROM ("acceptedAt" - "createdAt")) / 60) FROM "Order" WHERE "sellerId" = ${id} AND "acceptedAt" >= ${start} AND "acceptedAt" < ${end})::float AS accept,
        (SELECT AVG(EXTRACT(EPOCH FROM ("deliveredAt" - "pickedUpAt")) / 60) FROM "Order" WHERE "sellerId" = ${id} AND status = 'DELIVERED' AND "deliveredAt" >= ${start} AND "deliveredAt" < ${end})::float AS delivery`;
    res.json({
      user: u,
      accepted,
      completed: completedSeller,
      cancelled: cancelledSeller,
      revenue: revenue._sum.finalTotal || 0,
      delivered,
      stockMovements: movements,
      productsCreated,
      avgAcceptMin: timing[0]?.accept == null ? null : Math.round(timing[0].accept * 10) / 10,
      avgDeliveryMin: timing[0]?.delivery == null ? null : Math.round(timing[0].delivery * 10) / 10,
    });
  }),
);

adminRouter.patch(
  '/staff/:id',
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const body = z.object({ role: z.enum(STAFF_ROLES).optional(), isBlocked: z.boolean().optional() }).parse(req.body);
    const u = await prisma.user.findUnique({ where: { id } });
    if (!u) throw notFound();
    if (isEnvAdmin(u.telegramId)) throw forbidden('CANNOT_CHANGE_MAIN_ADMIN', 'Asosiy admin (ADMIN_TELEGRAM_ID) o\'zgartirilmaydi');
    const updated = await prisma.user.update({ where: { id }, data: body });
    await audit(req.actor!, 'staff.update', 'User', id, { role: u.role, isBlocked: u.isBlocked }, body);
    void setMenuButtonFor(updated);
    res.json({ ok: true });
  }),
);

/** Xodimni o'chirish: rol CUSTOMER'ga qaytariladi (buyurtmalar tarixi saqlanadi) */
adminRouter.delete(
  '/staff/:id',
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const u = await prisma.user.findUnique({ where: { id } });
    if (!u) throw notFound();
    if (isEnvAdmin(u.telegramId)) throw forbidden('CANNOT_CHANGE_MAIN_ADMIN', 'Asosiy adminni o\'chirib bo\'lmaydi');
    const updated = await prisma.user.update({ where: { id }, data: { role: 'CUSTOMER', isBlocked: false } });
    await audit(req.actor!, 'staff.remove', 'User', id, { role: u.role }, { role: 'CUSTOMER' });
    void setMenuButtonFor(updated);
    res.json({ ok: true });
  }),
);

// ---------- Taklif linklari ----------
adminRouter.get(
  '/invites',
  ah(async (_req, res) => {
    const invites = await prisma.invite.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { usedBy: { select: { id: true, firstName: true, lastName: true, phone: true } } },
    });
    const username = bot.botInfo?.username;
    res.json(
      invites.map((i) => ({
        ...i,
        link: `https://t.me/${username}?start=inv_${i.token}`,
        state: i.usedAt ? 'USED' : i.revoked ? 'REVOKED' : i.expiresAt < new Date() ? 'EXPIRED' : 'ACTIVE',
      })),
    );
  }),
);

adminRouter.post(
  '/invites',
  ah(async (req, res) => {
    const body = z
      .object({ staffName: z.string().trim().min(2).max(60), role: z.enum(['SELLER', 'WAREHOUSE']) })
      .parse(req.body);
    const token = crypto.randomBytes(24).toString('base64url').replace(/[^A-Za-z0-9]/g, '').slice(0, 32).padEnd(32, '0');
    const invite = await prisma.invite.create({
      data: {
        token,
        role: body.role,
        staffName: body.staffName,
        expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
        createdById: req.actor!.userId,
      },
    });
    await audit(req.actor!, 'invite.create', 'Invite', invite.id, null, body);
    res.status(201).json({ ...invite, link: `https://t.me/${bot.botInfo?.username}?start=inv_${token}`, state: 'ACTIVE' });
  }),
);

adminRouter.post(
  '/invites/:id/revoke',
  ah(async (req, res) => {
    const id = Number(req.params.id);
    await prisma.invite.updateMany({ where: { id, usedAt: null }, data: { revoked: true } });
    await audit(req.actor!, 'invite.revoke', 'Invite', id);
    res.json({ ok: true });
  }),
);

// ================= RASSILKA =================
adminRouter.get(
  '/broadcasts',
  ah(async (_req, res) => {
    const [items, counts] = await Promise.all([
      prisma.broadcast.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
      Promise.all(
        (['ALL', 'ACTIVE_30', 'INACTIVE_30', 'NO_ORDERS'] as const).map(async (s) => [s, await prisma.user.count({ where: segmentWhere(s) })] as const),
      ),
    ]);
    res.json({ items, segments: Object.fromEntries(counts) });
  }),
);

adminRouter.post(
  '/broadcasts',
  ah(async (req, res) => {
    const body = z
      .object({
        text: z.string().trim().min(1).max(1000),
        imageUrl: z.string().startsWith('/uploads/').nullable().optional(),
        segment: z.enum(['ALL', 'ACTIVE_30', 'INACTIVE_30', 'NO_ORDERS']).default('ALL'),
      })
      .parse(req.body);
    const b = await prisma.broadcast.create({
      data: { text: escapeHtml(body.text), imageUrl: body.imageUrl || null, segment: body.segment, createdBy: req.actor!.label },
    });
    await audit(req.actor!, 'broadcast.create', 'Broadcast', b.id, null, body);
    void runBroadcasts();
    res.status(201).json(b);
  }),
);

// ================= "MENING SHOKOLADIM" SHABLONLARI =================
const frac = z.number().min(0).max(1);
const templateBody = z
  .object({
    titleUz: z.string().trim().min(1).max(120),
    imageUrl: z.string().regex(/^\/uploads\/templates\/[\w-]+\.jpg$/, 'Shablon rasmini yuklang'),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    areaX: frac,
    areaY: frac,
    areaW: z.number().min(0.05).max(1),
    areaH: z.number().min(0.05).max(1),
    productId: z.number().int().positive(),
    sortOrder: z.number().int().default(0),
    isActive: z.boolean().default(true),
  })
  .refine((b) => b.areaX + b.areaW <= 1.0001 && b.areaY + b.areaH <= 1.0001, { message: 'Rasm joyi shablon chegarasidan chiqib ketdi', path: ['areaW'] });

adminRouter.get(
  '/personal-templates',
  ah(async (_req, res) => {
    res.json(
      await prisma.personalTemplate.findMany({
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        include: { product: { select: { id: true, nameUz: true, nameRu: true, price: true, isActive: true } } },
      }),
    );
  }),
);

adminRouter.post(
  '/personal-templates',
  ah(async (req, res) => {
    const data = templateBody.parse(req.body);
    const t = await prisma.personalTemplate.create({ data: { ...data, titleRu: data.titleUz } });
    enqueueTranslation('template', t.id);
    await audit(req.actor!, 'template.create', 'PersonalTemplate', t.id, null, data);
    res.status(201).json(t);
  }),
);

adminRouter.patch(
  '/personal-templates/:id',
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const before = await prisma.personalTemplate.findUnique({ where: { id } });
    if (!before) throw notFound();
    const data = templateBody.parse(req.body);
    const t = await prisma.personalTemplate.update({
      where: { id },
      data: { ...data, ...(data.titleUz !== before.titleUz && !aiEnabled() ? { titleRu: data.titleUz } : {}) },
    });
    if (data.titleUz !== before.titleUz) enqueueTranslation('template', id);
    await audit(req.actor!, 'template.update', 'PersonalTemplate', id, before, data);
    res.json(t);
  }),
);

adminRouter.delete(
  '/personal-templates/:id',
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const before = await prisma.personalTemplate.delete({ where: { id } });
    await audit(req.actor!, 'template.delete', 'PersonalTemplate', id, before, null);
    res.json({ ok: true });
  }),
);

// ================= BANNERLAR =================
const bannerBody = z.object({
  imageUrl: z.string().startsWith('/uploads/'),
  titleUz: z.string().trim().max(120).default(''),
  // Ixtiyoriy: yuborilmasa avtomatik tarjima qilinadi
  titleRu: z.string().trim().max(120).optional(),
  linkType: z.enum(['NONE', 'CATEGORY', 'PRODUCT']).default('NONE'),
  linkId: z.number().int().nullable().optional(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

/** AI bilan banner rasmi: yuklangan rasmlar + tavsif -> tayyor banner (saqlanmaydi, faqat rasm qaytadi) */
adminRouter.post(
  '/banners/ai',
  ah(async (req, res) => {
    const body = z
      .object({
        description: z.string().trim().min(3, 'Banner tavsifini yozing').max(1000),
        headline: z.string().trim().max(80).optional(),
        imageUrls: z.array(z.string().startsWith('/uploads/')).max(4).default([]),
      })
      .parse(req.body);
    if (!aiEnabled()) throw badRequest('AI_DISABLED', 'AI o\'chirilgan: GEMINI_API_KEY o\'rnatilmagan');
    try {
      const r = await generateBanner(body);
      await audit(req.actor!, 'banner.ai_generate', 'Banner', null, null, { description: body.description, headline: body.headline });
      res.json(r);
    } catch (e) {
      throw badRequest('AI_FAILED', (e as Error).message);
    }
  }),
);

adminRouter.get('/banners',ah(async (_req, res) => res.json(await prisma.banner.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }] }))));

adminRouter.post(
  '/banners',
  ah(async (req, res) => {
    const data = bannerBody.parse(req.body);
    const auto = !data.titleRu && !!data.titleUz;
    const b = await prisma.banner.create({
      data: { ...data, titleRu: data.titleRu || data.titleUz, linkId: data.linkType === 'NONE' ? null : data.linkId ?? null },
    });
    if (auto) enqueueTranslation('banner', b.id);
    await audit(req.actor!, 'banner.create', 'Banner', b.id, null, data);
    res.status(201).json(b);
  }),
);

adminRouter.patch(
  '/banners/:id',
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const data = bannerBody.partial().parse(req.body);
    const before = await prisma.banner.findUnique({ where: { id } });
    if (!before) throw notFound();
    const auto = !data.titleRu && data.titleUz !== undefined && data.titleUz !== before.titleUz;
    if (!data.titleRu) delete data.titleRu;
    if (auto && (!aiEnabled() || !data.titleUz)) data.titleRu = data.titleUz;
    const b = await prisma.banner.update({ where: { id }, data });
    if (auto && data.titleUz) enqueueTranslation('banner', id);
    await audit(req.actor!, 'banner.update', 'Banner', id, before, data);
    res.json(b);
  }),
);

adminRouter.delete(
  '/banners/:id',
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const before = await prisma.banner.delete({ where: { id } });
    await audit(req.actor!, 'banner.delete', 'Banner', id, before, null);
    res.json({ ok: true });
  }),
);

// ================= SOZLAMALAR =================
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format HH:MM');

adminRouter.get(
  '/settings',
  ah(async (_req, res) => {
    res.json({ settings: await getSettings(), ai: await aiMonthlyStats(), bot: { username: bot.botInfo?.username } });
  }),
);

adminRouter.put(
  '/settings',
  ah(async (req, res) => {
    const data = z
      .object({
        shopName: z.string().trim().min(1).max(100),
        logoUrl: z.string().startsWith('/uploads/').nullable().optional(),
        shopPhone: z.string().trim().max(30),
        shopAddress: z.string().trim().max(300),
        shopLat: z.number().min(-90).max(90).nullable(),
        shopLng: z.number().min(-180).max(180).nullable(),
        workHoursStart: hhmm,
        workHoursEnd: hhmm,
        deliveryFee: z.number().int().min(0),
        freeDeliveryFrom: z.number().int().min(0),
        minOrderAmount: z.number().int().min(0),
        acceptTimeoutMinutes: z.number().int().min(0).max(1440),
      })
      .parse(req.body);
    const before = await getSettings();
    const s = await prisma.settings.update({ where: { id: 1 }, data });
    await audit(req.actor!, 'settings.update', 'Settings', 1, before, data);
    res.json(s);
  }),
);

// ================= YUKLASH (banner, rassilka) =================
adminRouter.post(
  '/uploads',
  imageUpload.single('file'),
  ah(async (req, res) => {
    if (!req.file) throw badRequest('NO_FILE', 'Rasm tanlanmagan');
    const folder = z.enum(['banners', 'broadcasts', 'categories', 'branding', 'templates']).default('banners').parse(req.query.folder) as Folder;
    // Shablon chop etish sifatida (JPG, to'liq o'lcham) saqlanadi
    if (folder === 'templates') {
      const t = await saveJpeg(req.file.buffer, 'templates', { maxSize: 4000, quality: 95 });
      return res.status(201).json({ url: t.url, thumbUrl: t.url, width: t.width, height: t.height });
    }
    const saved = await saveImage(req.file.buffer, folder, folder === 'branding' ? { maxSize: 512, quality: 92 } : folder === 'categories' ? { maxSize: 600 } : {});
    res.status(201).json({ url: saved.url, thumbUrl: saved.thumbUrl });
  }),
);

// ================= EKSPORT =================
const exportType = z.enum(['orders', 'customers', 'products', 'stock']);

adminRouter.get(
  '/export/:type',
  ah(async (req, res) => {
    const type = exportType.parse(req.params.type) as ExportType;
    const q = z.object({ from: z.string().optional(), to: z.string().optional() }).parse(req.query);
    const range = q.from && q.to ? resolveRange('custom', q.from, q.to) : undefined;
    const { buffer, filename } = await buildExport(type, range);
    await audit(req.actor!, 'export', type, null);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }),
);

/** Mini app'dan: faylni bot orqali adminning o'ziga yuboradi */
adminRouter.post(
  '/export/:type/send',
  ah(async (req, res) => {
    const type = exportType.parse(req.params.type) as ExportType;
    const user = req.actor!.user;
    if (!user) throw badRequest('TG_ONLY', 'Faqat Telegram orqali');
    const { buffer, filename } = await buildExport(type);
    const r = await safeCall(user.telegramId, () =>
      bot.api.sendDocument(String(user.telegramId), new InputFile(buffer, filename), { caption: filename }),
    );
    await audit(req.actor!, 'export', type, null);
    if (!r.ok) throw badRequest('SEND_FAILED', 'Fayl yuborilmadi: ' + r.error);
    res.json({ ok: true, filename });
  }),
);

// ================= AUDIT =================
adminRouter.get(
  '/audit',
  ah(async (req, res) => {
    const q = z
      .object({ entity: z.string().max(40).optional(), userId: z.coerce.number().int().optional(), page, limit: z.coerce.number().int().min(1).max(200).default(50) })
      .parse(req.query);
    const where: Prisma.AuditLogWhereInput = {};
    if (q.entity) where.entity = q.entity;
    if (q.userId) where.userId = q.userId;
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.limit, take: q.limit }),
      prisma.auditLog.count({ where }),
    ]);
    res.json({ items, total, page: q.page, pages: Math.ceil(total / q.limit) });
  }),
);

// Statistikada ishlatiladigan mahsulot qoldig'i qiymati
adminRouter.get(
  '/stock/summary',
  ah(async (_req, res) => {
    const products = await prisma.product.findMany({ select: { stock: true, price: true, isActive: true } });
    const value = products.reduce((s, p) => s + Math.round(toNum(p.stock) * p.price), 0);
    res.json({ products: products.length, active: products.filter((p) => p.isActive).length, value });
  }),
);
