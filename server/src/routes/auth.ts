import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { prisma } from '../db';
import { env } from '../env';
import { ah, HttpError, unauthorized } from '../lib/errors';
import { ADMIN_COOKIE, authenticate, signAdminJwt } from '../lib/auth';
import { audit } from '../lib/audit';
import { logger } from '../logger';

export const authRouter = Router();

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
let dummyHash: string | null = null;

/** ADMIN_WEB_LOGIN / ADMIN_WEB_PASSWORD dan web admin hisobini yaratadi yoki yangilaydi */
export async function syncAdminAccount() {
  const login = env.ADMIN_WEB_LOGIN;
  const existing = await prisma.adminAccount.findUnique({ where: { login } });
  if (!existing) {
    await prisma.adminAccount.create({ data: { login, passwordHash: await bcrypt.hash(env.ADMIN_WEB_PASSWORD, 12) } });
    logger.info({ login }, 'Web admin hisobi yaratildi');
  } else if (!(await bcrypt.compare(env.ADMIN_WEB_PASSWORD, existing.passwordHash))) {
    await prisma.adminAccount.update({
      where: { id: existing.id },
      data: { passwordHash: await bcrypt.hash(env.ADMIN_WEB_PASSWORD, 12), failedAttempts: 0, lockedUntil: null },
    });
    logger.info({ login }, 'Web admin paroli yangilandi');
  }
  // Env'dagi logindan boshqa eski hisoblarni o'chiramiz
  await prisma.adminAccount.deleteMany({ where: { login: { not: login } } });
}

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

authRouter.post(
  '/web/login',
  loginLimiter,
  ah(async (req, res) => {
    const { login, password } = z.object({ login: z.string().trim().min(1).max(100), password: z.string().min(1).max(200) }).parse(req.body);
    const acc = await prisma.adminAccount.findUnique({ where: { login } });
    if (!acc) {
      dummyHash ??= await bcrypt.hash('dummy-password', 12);
      await bcrypt.compare(password, dummyHash); // vaqt hujumidan himoya
      throw unauthorized('BAD_CREDENTIALS', 'Login yoki parol noto\'g\'ri');
    }
    if (acc.lockedUntil && acc.lockedUntil > new Date()) {
      const min = Math.ceil((acc.lockedUntil.getTime() - Date.now()) / 60000);
      throw new HttpError(423, 'LOCKED', `Ko'p xato urinish. ${min} daqiqadan keyin qayta urinib ko'ring.`, { minutes: min });
    }
    const ok = await bcrypt.compare(password, acc.passwordHash);
    if (!ok) {
      const attempts = acc.failedAttempts + 1;
      const lock = attempts >= MAX_ATTEMPTS;
      await prisma.adminAccount.update({
        where: { id: acc.id },
        data: {
          failedAttempts: lock ? 0 : attempts,
          lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000) : null,
        },
      });
      await audit({ userId: null, label: `web:${login}` }, 'web.login_failed', 'AdminAccount', acc.id);
      if (lock) throw new HttpError(423, 'LOCKED', `Ko'p xato urinish. ${LOCK_MINUTES} daqiqadan keyin qayta urinib ko'ring.`, { minutes: LOCK_MINUTES });
      throw unauthorized('BAD_CREDENTIALS', `Login yoki parol noto'g'ri. Qolgan urinishlar: ${MAX_ATTEMPTS - attempts}`);
    }
    await prisma.adminAccount.update({ where: { id: acc.id }, data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() } });
    res.cookie(ADMIN_COOKIE, signAdminJwt(acc.id, acc.login), {
      httpOnly: true,
      secure: env.isProd,
      sameSite: 'strict',
      maxAge: 7 * 24 * 3600 * 1000,
      path: '/',
    });
    await audit({ userId: null, label: `web:${login}` }, 'web.login', 'AdminAccount', acc.id);
    res.json({ ok: true, login: acc.login });
  }),
);

authRouter.post('/web/logout', (_req, res) => {
  res.clearCookie(ADMIN_COOKIE, { path: '/' });
  res.json({ ok: true });
});

/** Joriy foydalanuvchi (mini app yoki web) */
authRouter.get(
  '/me',
  authenticate,
  ah(async (req, res) => {
    const a = req.actor!;
    if (a.kind === 'web') return res.json({ kind: 'web', role: 'ADMIN', label: a.label, registered: true });
    const u = a.user;
    if (!u) return res.json({ kind: 'tg', registered: false });
    res.json({
      kind: 'tg',
      registered: u.regStep === 'DONE',
      blocked: u.isBlocked,
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      phone: u.phone,
      language: u.language,
      role: u.role,
    });
  }),
);
