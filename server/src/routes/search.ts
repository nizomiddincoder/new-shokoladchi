import crypto from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { prisma } from '../db';
import { env } from '../env';
import { imageDto } from '../lib/dto';
import { ah } from '../lib/errors';
import { toNum } from '../lib/format';
import { searchItems } from '../services/search';

/**
 * Tashqi tizimlar uchun mahsulot qidiruvi: GET /search?q=...
 * Himoya: "X-API-Key" sarlavhasi SEARCH_API_KEY environment o'zgaruvchisiga teng bo'lishi shart.
 * SEARCH_API_KEY o'rnatilmagan bo'lsa — barcha so'rovlar 401.
 */
export const searchRouter = Router();

const digest = (s: string) => crypto.createHash('sha256').update(s).digest();

function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const given = req.get('X-API-Key') ?? '';
  const ok = !!env.SEARCH_API_KEY && !!given && crypto.timingSafeEqual(digest(given), digest(env.SEARCH_API_KEY));
  if (!ok) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'X-API-Key noto\'g\'ri yoki berilmagan' } });
    return;
  }
  next();
}

searchRouter.get(
  '/',
  requireApiKey,
  ah(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const limitRaw = Number(req.query.limit);
    const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 20;
    if (!q) {
      res.json([]);
      return;
    }
    const products = await prisma.product.findMany({
      select: { id: true, nameUz: true, nameRu: true, descriptionUz: true, price: true, stock: true, isActive: true },
    });
    const found = searchItems(
      q,
      products.map((p) => ({ ...p, names: [p.nameUz, p.nameRu] })),
      limit,
    );
    // Rasmlar faqat topilgan mahsulotlar uchun, bitta so'rovda; har biriga birinchisi
    const images = found.length
      ? await prisma.productImage.findMany({
          where: { productId: { in: found.map((p) => p.id) } },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        })
      : [];
    const firstImage = new Map<number, string>();
    for (const img of images) {
      if (img.productId != null && !firstImage.has(img.productId)) firstImage.set(img.productId, imageDto(img).url);
    }
    res.json(
      found.map((p) => ({
        id: p.id,
        name: p.nameUz,
        price: p.price,
        // Mijozlarga ko'rinadi va omborda bor
        available: p.isActive && toNum(p.stock) > 0,
        // "/uploads/..." nisbiy yo'l (kalitsiz ochiq); rasm bo'lmasa null
        image: firstImage.get(p.id) ?? null,
        description: p.descriptionUz || '',
      })),
    );
  }),
);
