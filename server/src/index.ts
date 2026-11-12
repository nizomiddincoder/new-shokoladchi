import { env } from './env';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { webhookCallback } from 'grammy';
import { logger } from './logger';
import { prisma, getSettings } from './db';
import { errorHandler, notFound } from './lib/errors';
import { authenticate, requireRegistered } from './lib/auth';
import { bot, WEBHOOK_PATH, WEBHOOK_SECRET } from './bot/instance';
import { registerHandlers, setupBot } from './bot/handlers';
import { authRouter, syncAdminAccount } from './routes/auth';
import { catalogRouter } from './routes/catalog';
import { customerRouter } from './routes/customer';
import { staffRouter } from './routes/staff';
import { manageRouter } from './routes/manage';
import { adminRouter } from './routes/admin';
import { ensureUploadDirs } from './services/storage';
import { startCron } from './services/cron';
import { resumePendingAi } from './services/ai';
import { runBroadcasts } from './services/broadcast';
import { seedDemoData } from './seed';

const here = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST = path.resolve(here, '../../web/dist');

function buildApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      frameguard: false, // Telegram Web mini app'ni iframe ichida ochadi
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'", 'https://telegram.org'],
          'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
          'img-src': ["'self'", 'data:', 'blob:', 'https://*.tile.openstreetmap.org', 'https://tile.openstreetmap.org'],
          'connect-src': ["'self'"],
          'frame-ancestors': ["'self'", 'https://web.telegram.org', 'https://*.telegram.org'],
          'upgrade-insecure-requests': env.isProd ? [] : null,
        },
      },
    }),
  );
  app.use(cors({ origin: env.WEBAPP_URL, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ ok: true, db: 'ok', bot: bot.botInfo?.username ?? null, time: new Date().toISOString() });
    } catch {
      res.status(503).json({ ok: false, db: 'error' });
    }
  });

  // Telegram webhook
  app.post(WEBHOOK_PATH, webhookCallback(bot, 'express', { secretToken: WEBHOOK_SECRET, timeoutMilliseconds: 25_000, onTimeout: 'return' }));

  // API
  const apiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false });
  app.use('/api', apiLimiter);
  app.use('/api/auth', authRouter);
  app.use('/api/catalog', authenticate, requireRegistered, catalogRouter);
  app.use('/api/shop', authenticate, requireRegistered, customerRouter);
  app.use('/api/staff', authenticate, requireRegistered, staffRouter);
  app.use('/api/manage', authenticate, requireRegistered, manageRouter);
  app.use('/api/admin', authenticate, requireRegistered, adminRouter);
  app.use('/api', (_req, _res, next) => next(notFound('NO_ROUTE', 'API topilmadi')));

  // Yuklangan rasmlar
  app.use('/uploads', express.static(env.UPLOAD_DIR, { maxAge: '30d', immutable: true, fallthrough: false }));

  // Frontend (Vite build)
  if (fs.existsSync(WEB_DIST)) {
    app.use('/assets', express.static(path.join(WEB_DIST, 'assets'), { maxAge: '1y', immutable: true }));
    app.use(express.static(WEB_DIST, { index: false, maxAge: '1h' }));
    const sendHtml = (file: string) => (_req: express.Request, res: express.Response) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(WEB_DIST, file));
    };
    app.get(['/app', '/app/*'], sendHtml('app/index.html'));
    app.get(['/admin', '/admin/*'], sendHtml('admin/index.html'));
  } else {
    logger.warn({ WEB_DIST }, 'Frontend build topilmadi (npm run build)');
  }
  app.get('/', (_req, res) => res.redirect('/admin/'));

  app.use(errorHandler);
  return app;
}

async function main() {
  logger.info({ env: env.NODE_ENV, tz: process.env.TZ }, 'Server ishga tushmoqda');
  await prisma.$connect();
  await getSettings();
  await syncAdminAccount();
  if (env.SEED_DEMO_DATA) {
    const r = await seedDemoData(prisma);
    logger.info(r, 'Demo ma\'lumotlar');
  }
  await ensureUploadDirs();

  registerHandlers();
  try {
    const info = await setupBot();
    logger.info({ username: info.username }, 'Bot ulandi');
  } catch (err) {
    logger.error({ err }, 'Botga ulanib bo\'lmadi. BOT_TOKEN to\'g\'riligini tekshiring.');
    process.exit(1);
  }

  const app = buildApp();
  const server = app.listen(env.PORT, () => logger.info({ port: env.PORT }, 'HTTP server tinglamoqda'));

  if (env.BOT_WEBHOOK) {
    const url = `${env.WEBAPP_URL}${WEBHOOK_PATH}`;
    try {
      await bot.api.setWebhook(url, {
        secret_token: WEBHOOK_SECRET,
        allowed_updates: ['message', 'callback_query'],
        drop_pending_updates: false,
      });
      logger.info({ url }, 'Webhook o\'rnatildi');
    } catch (err) {
      logger.error({ err, url }, 'Webhook o\'rnatilmadi. WEBAPP_URL to\'g\'riligini tekshiring.');
    }
  } else {
    await bot.api.deleteWebhook().catch(() => undefined);
    void bot.start({ allowed_updates: ['message', 'callback_query'] });
    logger.info('Bot polling rejimida (BOT_WEBHOOK=false)');
  }

  startCron();
  void resumePendingAi();
  void runBroadcasts();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'To\'xtatilmoqda');
    server.close();
    if (!env.BOT_WEBHOOK) await bot.stop().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandledRejection'));

main().catch((err) => {
  logger.fatal({ err }, 'Server ishga tushmadi');
  process.exit(1);
});
