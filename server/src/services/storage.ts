import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { env } from '../env';
import { prisma } from '../db';
import { logger } from '../logger';
import { badRequest } from '../lib/errors';

/**
 * Rasmlar diskda (UPLOAD_DIR) saqlanadi va har biri bazada ham zaxiralanadi (UploadBlob).
 * Railway'da Volume ulanmagan bo'lsa disk har deploy'da tozalanadi — shunda rasm bazadan
 * olinib, diskka qayta yoziladi. Shu sababli rasmlar hech qachon yo'qolmaydi.
 */

export const FOLDERS = ['products', 'orders', 'banners', 'broadcasts', 'categories', 'branding', 'templates', 'designs'] as const;
export type Folder = (typeof FOLDERS)[number];

const MIME: Record<string, string> = { '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };
export const mimeOf = (p: string) => MIME[path.extname(p).toLowerCase()] || 'application/octet-stream';

export async function ensureUploadDirs() {
  for (const f of FOLDERS) await fs.mkdir(path.join(env.UPLOAD_DIR, f), { recursive: true });
}

function randomName() {
  return `${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}`;
}

/** Faylni diskka yozadi va bazaga zaxira nusxasini saqlaydi */
async function persist(rel: string, data: Buffer) {
  const full = path.join(env.UPLOAD_DIR, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, data);
  await prisma.uploadBlob.upsert({
    where: { path: rel },
    create: { path: rel, mime: mimeOf(rel), data },
    update: { mime: mimeOf(rel), data },
  });
  return full;
}

export type SavedImage = { url: string; thumbUrl: string; filePath: string };

/** Rasmni WebP'ga o'tkazib saqlaydi: max 1200px va 400px thumbnail */
export async function saveImage(input: Buffer, folder: Folder, opts: { quality?: number; maxSize?: number } = {}): Promise<SavedImage> {
  const quality = opts.quality ?? 84;
  const max = opts.maxSize ?? 1200;
  let meta;
  try {
    meta = await sharp(input).metadata();
  } catch {
    throw badRequest('BAD_IMAGE', 'Rasm formati qo\'llab-quvvatlanmaydi');
  }
  if (!meta.width || !meta.height) throw badRequest('BAD_IMAGE', 'Rasm o\'qilmadi');
  const name = randomName();
  const main = await sharp(input).rotate().resize(max, max, { fit: 'inside', withoutEnlargement: true }).webp({ quality }).toBuffer();
  const thumb = await sharp(input).rotate().resize(400, 400, { fit: 'inside', withoutEnlargement: true }).webp({ quality: Math.max(78, quality - 6) }).toBuffer();
  const filePath = await persist(`${folder}/${name}.webp`, main);
  await persist(`${folder}/${name}_t.webp`, thumb);
  return {
    url: `/uploads/${folder}/${name}.webp`,
    thumbUrl: `/uploads/${folder}/${name}_t.webp`,
    filePath,
  };
}

/**
 * Yuqori sifatli JPG sifatida saqlaydi (chop etish uchun: "Mening shokoladim" shablon va dizaynlari).
 * Shaffof joylar oq fonga aylantiriladi.
 */
export async function saveJpeg(input: Buffer, folder: Folder, opts: { maxSize?: number; quality?: number } = {}) {
  let meta;
  try {
    meta = await sharp(input).metadata();
  } catch {
    throw badRequest('BAD_IMAGE', 'Rasm formati qo\'llab-quvvatlanmaydi');
  }
  if (!meta.width || !meta.height) throw badRequest('BAD_IMAGE', 'Rasm o\'qilmadi');
  const max = opts.maxSize ?? 3000;
  const name = randomName();
  const { data, info } = await sharp(input)
    .rotate()
    .resize(max, max, { fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: opts.quality ?? 95, chromaSubsampling: '4:4:4', mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  const filePath = await persist(`${folder}/${name}.jpg`, data);
  return { url: `/uploads/${folder}/${name}.jpg`, filePath, width: info.width, height: info.height };
}

/** "/uploads/x/y.webp" -> "x/y.webp" (xavfsiz, papkadan tashqariga chiqib bo'lmaydi) */
export function urlToRel(url: string | null | undefined): string | null {
  if (!url || !url.startsWith('/uploads/')) return null;
  const rel = path.posix.normalize(url.slice('/uploads/'.length).split('?')[0]);
  if (!rel || rel.startsWith('..') || rel.includes('\0') || path.posix.isAbsolute(rel)) return null;
  return rel;
}

export function urlToPath(url: string | null | undefined): string | null {
  const rel = urlToRel(url);
  if (!rel) return null;
  const full = path.resolve(env.UPLOAD_DIR, rel);
  if (!full.startsWith(path.resolve(env.UPLOAD_DIR))) return null;
  return full;
}

/**
 * Fayl diskda bo'lishini ta'minlaydi: bo'lmasa bazadagi zaxiradan tiklaydi.
 * Diskdagi yo'lni qaytaradi (topilmasa null).
 */
export async function ensureLocal(url: string | null | undefined): Promise<string | null> {
  const full = urlToPath(url);
  const rel = urlToRel(url);
  if (!full || !rel) return null;
  try {
    await fs.access(full);
    return full;
  } catch {
    /* diskda yo'q — bazadan tiklaymiz */
  }
  const blob = await prisma.uploadBlob.findUnique({ where: { path: rel } });
  if (!blob) return null;
  try {
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, blob.data);
  } catch (err) {
    logger.warn({ err, rel }, 'Zaxiradan diskka yozib bo\'lmadi');
    return null;
  }
  return full;
}

export async function readUpload(url: string): Promise<Buffer | null> {
  const p = urlToPath(url);
  if (!p) return null;
  try {
    return await fs.readFile(p);
  } catch {
    const rel = urlToRel(url);
    const blob = rel ? await prisma.uploadBlob.findUnique({ where: { path: rel } }) : null;
    if (!blob) return null;
    void ensureLocal(url);
    return Buffer.from(blob.data);
  }
}

export async function uploadExists(url: string | null | undefined) {
  return !!(await ensureLocal(url));
}

export async function removeUpload(...urls: (string | null | undefined)[]) {
  for (const u of urls) {
    const p = urlToPath(u);
    const rel = urlToRel(u);
    if (p) await fs.rm(p, { force: true }).catch(() => undefined);
    if (rel) await prisma.uploadBlob.deleteMany({ where: { path: rel } }).catch(() => undefined);
  }
}

/**
 * Diskda bor, lekin bazada zaxirasi yo'q fayllarni zaxiralaydi (yangilanishdan oldin
 * yuklangan rasmlar uchun). Server ishga tushganda fonda bir marta ishlaydi.
 */
export async function backfillUploadBlobs() {
  let added = 0;
  for (const folder of FOLDERS) {
    const dir = path.join(env.UPLOAD_DIR, folder);
    const files = await fs.readdir(dir).catch(() => [] as string[]);
    if (!files.length) continue;
    const existing = new Set(
      (await prisma.uploadBlob.findMany({ where: { path: { startsWith: `${folder}/` } }, select: { path: true } })).map((b) => b.path),
    );
    for (const f of files) {
      const rel = `${folder}/${f}`;
      if (existing.has(rel) || !MIME[path.extname(f).toLowerCase()]) continue;
      try {
        const data = await fs.readFile(path.join(dir, f));
        await prisma.uploadBlob.create({ data: { path: rel, mime: mimeOf(rel), data } });
        added++;
      } catch (err) {
        logger.warn({ err, rel }, 'Rasm zaxiralanmadi');
      }
    }
  }
  if (added) logger.info({ added }, 'Diskdagi rasmlar bazaga zaxiralandi');
}

/** Bazada ishlatilayotgan, lekin na diskda, na zaxirada bo'lgan rasmlar (admin uchun hisobot) */
export async function missingUploads() {
  const [settings, banners, categories, images, templates] = await Promise.all([
    prisma.settings.findUnique({ where: { id: 1 }, select: { logoUrl: true } }),
    prisma.banner.findMany({ select: { id: true, imageUrl: true, titleUz: true } }),
    prisma.category.findMany({ where: { imageUrl: { startsWith: '/uploads/' } }, select: { id: true, imageUrl: true, nameUz: true } }),
    prisma.productImage.findMany({ where: { productId: { not: null } }, select: { id: true, originalUrl: true, aiUrl: true, useAi: true, productId: true, product: { select: { nameUz: true } } } }),
    prisma.personalTemplate.findMany({ select: { id: true, imageUrl: true, titleUz: true } }),
  ]);
  const checks: { kind: string; id: number | null; name: string; url: string }[] = [];
  if (settings?.logoUrl) checks.push({ kind: 'logo', id: null, name: 'Logo', url: settings.logoUrl });
  for (const b of banners) checks.push({ kind: 'banner', id: b.id, name: b.titleUz || `Banner #${b.id}`, url: b.imageUrl });
  for (const c of categories) checks.push({ kind: 'category', id: c.id, name: c.nameUz, url: c.imageUrl! });
  for (const i of images) {
    checks.push({ kind: 'product', id: i.productId, name: i.product?.nameUz || `#${i.productId}`, url: i.originalUrl });
    if (i.aiUrl && i.useAi) checks.push({ kind: 'product', id: i.productId, name: i.product?.nameUz || `#${i.productId}`, url: i.aiUrl });
  }
  for (const t of templates) checks.push({ kind: 'template', id: t.id, name: t.titleUz, url: t.imageUrl });
  const missing: typeof checks = [];
  for (const c of checks) {
    const p = urlToPath(c.url);
    if (p && (await fs.access(p).then(() => true, () => false))) continue;
    const rel = urlToRel(c.url);
    if (rel && (await prisma.uploadBlob.count({ where: { path: rel } }))) continue;
    if (c.url.startsWith('/uploads/')) missing.push(c);
  }
  // Bir mahsulot bir marta ko'rsatiladi
  const seen = new Set<string>();
  const unique = missing.filter((m) => {
    const k = `${m.kind}:${m.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { total: checks.length, missing: unique };
}
