import { prisma } from '../db';
import { audit } from '../lib/audit';
import { badRequest } from '../lib/errors';
import type { Actor } from '../lib/auth';
import { env } from '../env';
import { logger } from '../logger';
import { removeUpload } from './storage';

export type ResetOptions = {
  /** Buyurtmalar, qoldiq harakatlari, AI/xabarnoma tarixi — statistika 0 bo'ladi */
  orders: boolean;
  /** Mahsulotlar, kategoriyalar, bannerlar, shablonlar va ularning rasmlari */
  catalog: boolean;
  /** Mijozlar (xodimlar va adminlar qoladi). Buyurtmalar ham tozalanishi shart */
  customers: boolean;
  /** Mahsulotlar qoladi, qoldiq va sotilgan soni 0 bo'ladi */
  stock: boolean;
};

/** Jadval bo'sh bo'lsa ID hisoblagichini 1 dan boshlaydi (yangi buyurtma #1 bo'lsin) */
async function restartIds(table: string, columns: string[] = ['id']) {
  const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT COUNT(*)::bigint AS n FROM "${table}"`);
  if (Number(rows[0]?.n ?? 0) > 0) return;
  for (const col of columns) {
    await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"${table}"', '${col}'), 1, false)`);
  }
}

async function removeAll(urls: (string | null | undefined)[]) {
  for (const u of urls) {
    if (!u) continue;
    await removeUpload(u).catch(() => undefined);
  }
}

/**
 * Test ma'lumotlarini tozalaydi. Admin akkauntlari, xodimlar, do'kon sozlamalari va logo saqlanadi.
 */
export async function resetData(opts: ResetOptions, actor: Actor) {
  if (opts.customers && !opts.orders) throw badRequest('ORDERS_REQUIRED', 'Mijozlarni o\'chirish uchun buyurtmalar ham tozalanishi kerak');
  if (!opts.orders && !opts.catalog && !opts.customers && !opts.stock) throw badRequest('NOTHING', 'Hech narsa tanlanmagan');
  const done: Record<string, number> = {};

  if (opts.orders) {
    const items = await prisma.orderItem.findMany({ where: { designUrl: { not: null } }, select: { designUrl: true } });
    const orders = await prisma.order.findMany({ where: { readyPhotoUrl: { not: null } }, select: { readyPhotoUrl: true } });
    const broadcasts = await prisma.broadcast.findMany({ where: { imageUrl: { not: null } }, select: { imageUrl: true } });
    await prisma.user.updateMany({ data: { awaitingPhotoOrderId: null, awaitingCancelOrderId: null } });
    await prisma.orderItem.deleteMany({});
    done.orders = (await prisma.order.deleteMany({})).count;
    await prisma.stockMovement.deleteMany({});
    await prisma.broadcast.deleteMany({});
    await prisma.aiCall.deleteMany({});
    await prisma.product.updateMany({ data: { soldCount: 0 } });
    await removeAll([...items.map((i) => i.designUrl), ...orders.map((o) => o.readyPhotoUrl), ...broadcasts.map((b) => b.imageUrl)]);
    await restartIds('Order', ['id', 'number']);
    await restartIds('OrderItem');
    await restartIds('StockMovement');
  }

  if (opts.catalog) {
    const [images, cats, banners, tpls] = await Promise.all([
      prisma.productImage.findMany({ select: { originalUrl: true, originalThumb: true, aiUrl: true, aiThumb: true } }),
      prisma.category.findMany({ select: { imageUrl: true } }),
      prisma.banner.findMany({ select: { imageUrl: true } }),
      prisma.personalTemplate.findMany({ select: { imageUrl: true } }),
    ]);
    await prisma.personalTemplate.deleteMany({});
    await prisma.productImage.deleteMany({});
    done.products = (await prisma.product.deleteMany({})).count;
    done.categories = (await prisma.category.deleteMany({})).count;
    await prisma.banner.deleteMany({});
    await removeAll([
      ...images.flatMap((i) => [i.originalUrl, i.originalThumb, i.aiUrl, i.aiThumb]),
      ...cats.map((c) => c.imageUrl),
      ...banners.map((b) => b.imageUrl),
      ...tpls.map((t) => t.imageUrl),
    ]);
    for (const t of ['Product', 'ProductImage', 'Category', 'Banner', 'PersonalTemplate']) await restartIds(t);
  } else if (opts.stock) {
    done.stock = (await prisma.product.updateMany({ data: { stock: 0, soldCount: 0 } })).count;
    await prisma.stockMovement.deleteMany({});
  }

  if (opts.customers) {
    // .env dagi adminlar va tozalashni bosgan odam hech qachon o'chmaydi
    const keepTg = env.ADMIN_TELEGRAM_IDS.map((id) => BigInt(id));
    done.customers = (
      await prisma.user.deleteMany({
        where: { role: 'CUSTOMER', telegramId: { notIn: keepTg }, ...(actor.userId ? { id: { not: actor.userId } } : {}) },
      })
    ).count;
  }

  await audit(actor, 'data.reset', 'System', null, null, { ...opts, ...done });
  logger.warn({ opts, done, by: actor.label }, 'Ma\'lumotlar tozalandi');
  return done;
}
