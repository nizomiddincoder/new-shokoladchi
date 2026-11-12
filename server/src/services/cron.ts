import cron from 'node-cron';
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
    },
    { timezone: tz },
  );
  logger.info('Cron vazifalari ishga tushdi');
}
