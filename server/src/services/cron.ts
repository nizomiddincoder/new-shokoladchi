import cron from 'node-cron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../env';
import { prisma, getSettings } from '../db';
import { logger } from '../logger';
import { ORDER_FULL, sendLowStockReport, sendTimeoutWarning } from '../bot/notify';
import { removeUpload } from './storage';
import { runBroadcasts } from './broadcast';

async function checkAcceptTimeouts() {
  const settings = await getSettings();
  const minutes = settings.acceptTimeoutMinutes;
  if (!minutes || minutes <= 0) return;
  const border = new Date(Date.now() - minutes * 60 * 1000);
  const orders = await prisma.order.findMany({
    where: { status: 'NEW', createdAt: { lte: border }, timeoutNotifiedAt: null },
    include: ORDER_FULL,
    take: 20,
  });
  for (const o of orders) {
    const res = await prisma.order.updateMany({
      where: { id: o.id, timeoutNotifiedAt: null, status: 'NEW' },
      data: { timeoutNotifiedAt: new Date() },
    });
    if (res.count === 1) await sendTimeoutWarning(o, minutes);
  }
}

/** Mahsulotga biriktirilmagan (1 kundan eski) rasmlarni tozalaydi */
async function cleanupOrphanImages() {
  const border = new Date(Date.now() - 24 * 3600 * 1000);
  const orphans = await prisma.productImage.findMany({ where: { productId: null, createdAt: { lt: border } } });
  for (const img of orphans) {
    await removeUpload(img.originalUrl, img.originalThumb, img.aiUrl, img.aiThumb);
    await prisma.productImage.delete({ where: { id: img.id } }).catch(() => undefined);
  }
  if (orphans.length) logger.info({ count: orphans.length }, 'Ishlatilmagan rasmlar tozalandi');
}

/** Buyurtmaga aylanmagan (2 kundan eski) "Mening shokoladim" dizaynlarini o'chiradi */
async function cleanupOrphanDesigns() {
  const dir = path.join(env.UPLOAD_DIR, 'designs');
  const files = await fs.readdir(dir).catch(() => [] as string[]);
  const border = Date.now() - 2 * 24 * 3600 * 1000;
  let removed = 0;
  for (const f of files) {
    const full = path.join(dir, f);
    const st = await fs.stat(full).catch(() => null);
    if (!st || st.mtimeMs > border) continue;
    const used = await prisma.orderItem.count({ where: { designUrl: `/uploads/designs/${f}` } });
    if (!used) {
      await fs.rm(full, { force: true });
      removed++;
    }
  }
  // Bazadagi zaxira nusxalar ham (diskda bo'lmasa ham)
  const blobs = await prisma.uploadBlob.findMany({
    where: { path: { startsWith: 'designs/' }, createdAt: { lt: new Date(border) } },
    select: { path: true },
  });
  for (const b of blobs) {
    const used = await prisma.orderItem.count({ where: { designUrl: `/uploads/${b.path}` } });
    if (!used) {
      await removeUpload(`/uploads/${b.path}`);
      removed++;
    }
  }
  if (removed) logger.info({ removed }, 'Ishlatilmagan dizaynlar tozalandi');
}

export function startCron() {
  const tz = 'Asia/Tashkent';
  cron.schedule(
    '* * * * *',
    () => {
      checkAcceptTimeouts().catch((err) => logger.error({ err }, 'Timeout tekshiruvida xato'));
      runBroadcasts().catch(() => undefined);
    },
    { timezone: tz },
  );
  cron.schedule(
    '0 9 * * *',
    () => {
      sendLowStockReport().catch((err) => logger.error({ err }, 'Kam qolganlar hisobotida xato'));
    },
    { timezone: tz },
  );
  cron.schedule(
    '30 3 * * *',
    () => {
      cleanupOrphanImages().catch((err) => logger.error({ err }, 'Rasm tozalashda xato'));
      cleanupOrphanDesigns().catch((err) => logger.error({ err }, 'Dizayn tozalashda xato'));
    },
    { timezone: tz },
  );
  logger.info('Cron vazifalari ishga tushdi');
}
