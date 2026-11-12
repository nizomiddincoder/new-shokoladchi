import path from 'node:path';

type Env = {
  NODE_ENV: string;
  PORT: number;
  BOT_TOKEN: string;
  WEBAPP_URL: string;
  DATABASE_URL: string;
  ADMIN_TELEGRAM_IDS: string[];
  ADMIN_PHONE: string;
  ADMIN_WEB_LOGIN: string;
  ADMIN_WEB_PASSWORD: string;
  JWT_SECRET: string;
  ORDERS_GROUP_CHAT_ID: string;
  GEMINI_API_KEY: string | null;
  GEMINI_IMAGE_MODEL: string;
  GEMINI_IMAGE_SIZE: string | null;
  GEMINI_TEXT_MODEL: string;
  GEMINI_BASE_URL: string | null;
  UPLOAD_DIR: string;
  TZ: string;
  SEED_DEMO_DATA: boolean;
  BOT_WEBHOOK: boolean;
  TELEGRAM_API_ROOT: string;
  isProd: boolean;
};

const REQUIRED: { key: string; hint: string }[] = [
  { key: 'BOT_TOKEN', hint: 'BotFather bergan token, masalan 123456:ABC...' },
  { key: 'WEBAPP_URL', hint: 'Railway domeni, masalan https://shop.up.railway.app' },
  { key: 'DATABASE_URL', hint: 'Railway Postgres: ${{Postgres.DATABASE_URL}}' },
  { key: 'ADMIN_TELEGRAM_ID', hint: 'Adminning Telegram ID raqami (bir nechta bo\'lsa vergul bilan)' },
  { key: 'ADMIN_WEB_LOGIN', hint: 'Web admin panel uchun login' },
  { key: 'ADMIN_WEB_PASSWORD', hint: 'Web admin panel uchun parol (kamida 8 belgi)' },
  { key: 'JWT_SECRET', hint: 'Kamida 32 belgili tasodifiy matn' },
  { key: 'ORDERS_GROUP_CHAT_ID', hint: 'Buyurtmalar guruhining ID raqami, masalan -1001234567890' },
];

function loadEnv(): Env {
  const missing = REQUIRED.filter(({ key }) => !process.env[key] || !process.env[key]!.trim());
  if (missing.length) {
    const lines = missing.map(({ key, hint }) => `  - ${key}: ${hint}`).join('\n');
    // eslint-disable-next-line no-console
    console.error(
      `\n[XATO] Majburiy environment o'zgaruvchilari topilmadi:\n${lines}\n\nRailway > servis > Variables bo'limiga qo'shing va qayta deploy qiling.\n`,
    );
    process.exit(1);
  }
  const problems: string[] = [];
  const webappUrl = process.env.WEBAPP_URL!.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(webappUrl)) problems.push('WEBAPP_URL https:// bilan boshlanishi kerak');
  if (process.env.JWT_SECRET!.length < 16) problems.push('JWT_SECRET kamida 16 belgi bo\'lishi kerak');
  if (process.env.ADMIN_WEB_PASSWORD!.length < 6) problems.push('ADMIN_WEB_PASSWORD kamida 6 belgi bo\'lishi kerak');
  if (!/^\d+:[\w-]+$/.test(process.env.BOT_TOKEN!.trim())) problems.push('BOT_TOKEN formati noto\'g\'ri');
  const adminIds = process.env.ADMIN_TELEGRAM_ID!.split(',').map((s) => s.trim()).filter(Boolean);
  if (adminIds.some((id) => !/^\d+$/.test(id))) problems.push('ADMIN_TELEGRAM_ID faqat raqamlardan iborat bo\'lishi kerak');
  if (!/^-?\d+$/.test(process.env.ORDERS_GROUP_CHAT_ID!.trim())) problems.push('ORDERS_GROUP_CHAT_ID raqam bo\'lishi kerak (masalan -100...)');
  if (problems.length) {
    console.error(`\n[XATO] Environment o'zgaruvchilarida xato:\n${problems.map((p) => '  - ' + p).join('\n')}\n`);
    process.exit(1);
  }
  const nodeEnv = process.env.NODE_ENV || 'production';
  return {
    NODE_ENV: nodeEnv,
    isProd: nodeEnv === 'production',
    PORT: Number(process.env.PORT || 3000),
    BOT_TOKEN: process.env.BOT_TOKEN!.trim(),
    WEBAPP_URL: webappUrl,
    DATABASE_URL: process.env.DATABASE_URL!,
    ADMIN_TELEGRAM_IDS: adminIds,
    ADMIN_PHONE: (process.env.ADMIN_PHONE || '').trim(),
    ADMIN_WEB_LOGIN: process.env.ADMIN_WEB_LOGIN!.trim(),
    ADMIN_WEB_PASSWORD: process.env.ADMIN_WEB_PASSWORD!,
    JWT_SECRET: process.env.JWT_SECRET!,
    ORDERS_GROUP_CHAT_ID: process.env.ORDERS_GROUP_CHAT_ID!.trim(),
    GEMINI_API_KEY: process.env.GEMINI_API_KEY?.trim() || null,
    GEMINI_IMAGE_MODEL: process.env.GEMINI_IMAGE_MODEL?.trim() || 'gemini-2.5-flash-image',
    // Faqat 2K/4K ni qo'llab-quvvatlaydigan modellar uchun (masalan gemini-3-pro-image-preview)
    GEMINI_IMAGE_SIZE: process.env.GEMINI_IMAGE_SIZE?.trim() || null,
    // Avtomatik tarjima (o'zbekcha -> ruscha) uchun
    GEMINI_TEXT_MODEL: process.env.GEMINI_TEXT_MODEL?.trim() || 'gemini-2.5-flash',
    // Ixtiyoriy: Gemini API uchun proxy manzili
    GEMINI_BASE_URL: process.env.GEMINI_BASE_URL?.trim() || null,
    UPLOAD_DIR: path.resolve(process.env.UPLOAD_DIR || '/data/uploads'),
    TZ: process.env.TZ || 'Asia/Tashkent',
    SEED_DEMO_DATA: process.env.SEED_DEMO_DATA === 'true',
    // Lokal ishlab chiqishda polling uchun BOT_WEBHOOK=false qo'yish mumkin
    BOT_WEBHOOK: process.env.BOT_WEBHOOK !== 'false',
    // O'z Bot API serveringiz bo'lsa (ixtiyoriy)
    TELEGRAM_API_ROOT: (process.env.TELEGRAM_API_ROOT || 'https://api.telegram.org').replace(/\/+$/, ''),
  };
}

export const env = loadEnv();
