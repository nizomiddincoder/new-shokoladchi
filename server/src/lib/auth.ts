import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Language, Role, User } from '@prisma/client';
import { prisma } from '../db';
import { env } from '../env';
import { verifyInitData } from './telegramAuth';
import { forbidden, unauthorized } from './errors';

export type Actor = {
  kind: 'tg' | 'web';
  user: User | null;
  userId: number | null;
  role: Role;
  label: string;
  lang: Language;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      actor?: Actor;
    }
  }
}

export const ADMIN_COOKIE = 'admin_token';

export function isEnvAdmin(telegramId: bigint | number | string) {
  return env.ADMIN_TELEGRAM_IDS.includes(String(telegramId));
}

export function actorLabelOf(user: Pick<User, 'firstName' | 'lastName' | 'phone'> | null) {
  if (!user) return '';
  return `${user.firstName} ${user.lastName}`.trim() || user.phone || '';
}

export function signAdminJwt(adminId: number, login: string) {
  return jwt.sign({ sub: adminId, login, kind: 'web' }, env.JWT_SECRET, { expiresIn: '7d' });
}

async function resolveActor(req: Request): Promise<Actor | null> {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('tma ')) {
    const tgUser = verifyInitData(auth.slice(4), env.BOT_TOKEN);
    if (!tgUser) throw unauthorized('INVALID_INIT_DATA', 'Telegram ma\'lumotlari yaroqsiz yoki eskirgan');
    let user = await prisma.user.findUnique({ where: { telegramId: BigInt(tgUser.id) } });
    if (isEnvAdmin(tgUser.id)) {
      if (!user) {
        user = await prisma.user.create({
          data: {
            telegramId: BigInt(tgUser.id),
            firstName: tgUser.first_name || 'Admin',
            lastName: tgUser.last_name || '',
            username: tgUser.username,
            role: 'ADMIN',
            regStep: 'DONE',
            phone: env.ADMIN_PHONE || null,
            language: tgUser.language_code === 'ru' ? 'ru' : 'uz',
          },
        });
      } else if (user.role !== 'ADMIN' || user.regStep !== 'DONE' || user.isBlocked) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { role: 'ADMIN', regStep: 'DONE', isBlocked: false },
        });
      }
    }
    if (!user) return { kind: 'tg', user: null, userId: null, role: 'CUSTOMER', label: '', lang: 'uz' };
    return { kind: 'tg', user, userId: user.id, role: user.role, label: actorLabelOf(user), lang: user.language };
  }

  const token = req.cookies?.[ADMIN_COOKIE];
  if (token) {
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as unknown as { sub: number; login: string; kind: string };
      if (payload.kind !== 'web') return null;
      const acc = await prisma.adminAccount.findUnique({ where: { id: Number(payload.sub) } });
      if (!acc) return null;
      return { kind: 'web', user: null, userId: null, role: 'ADMIN', label: `web:${acc.login}`, lang: 'uz' };
    } catch {
      return null;
    }
  }
  return null;
}

/** Har qanday avtorizatsiya (initData yoki admin cookie) */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const actor = await resolveActor(req);
    if (!actor) return next(unauthorized());
    req.actor = actor;
    next();
  } catch (e) {
    next(e);
  }
}

/** Ro'yxatdan o'tgan va bloklanmagan foydalanuvchi */
export function requireRegistered(req: Request, _res: Response, next: NextFunction) {
  const a = req.actor;
  if (!a) return next(unauthorized());
  if (a.kind === 'web') return next();
  if (!a.user || a.user.regStep !== 'DONE') return next(forbidden('NOT_REGISTERED', 'Avval botda ro\'yxatdan o\'ting'));
  if (a.user.isBlocked) return next(forbidden('BLOCKED', 'Hisobingiz bloklangan'));
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const a = req.actor;
    if (!a) return next(unauthorized());
    if (!roles.includes(a.role)) return next(forbidden());
    next();
  };
}

/** initData orqali kirgan Telegram foydalanuvchisi kerak (masalan savatcha) */
export function requireTgUser(req: Request, _res: Response, next: NextFunction) {
  if (req.actor?.kind !== 'tg' || !req.actor.user) return next(forbidden('TG_ONLY', 'Faqat Telegram orqali'));
  next();
}
