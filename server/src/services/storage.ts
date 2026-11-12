import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { env } from '../env';
import { badRequest } from '../lib/errors';

export const FOLDERS = ['products', 'orders', 'banners', 'broadcasts', 'categories', 'branding'] as const;
export type Folder = (typeof FOLDERS)[number];

export async function ensureUploadDirs() {
  for (const f of FOLDERS) await fs.mkdir(path.join(env.UPLOAD_DIR, f), { recursive: true });
}

function randomName() {
  return `${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}`;
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
  const dir = path.join(env.UPLOAD_DIR, folder);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${name}.webp`);
  const thumbPath = path.join(dir, `${name}_t.webp`);
  await sharp(input).rotate().resize(max, max, { fit: 'inside', withoutEnlargement: true }).webp({ quality }).toFile(filePath);
  await sharp(input).rotate().resize(400, 400, { fit: 'inside', withoutEnlargement: true }).webp({ quality: Math.max(78, quality - 6) }).toFile(thumbPath);
  return {
    url: `/uploads/${folder}/${name}.webp`,
    thumbUrl: `/uploads/${folder}/${name}_t.webp`,
    filePath,
  };
}

export function urlToPath(url: string | null | undefined): string | null {
  if (!url || !url.startsWith('/uploads/')) return null;
  const rel = url.slice('/uploads/'.length);
  const full = path.resolve(env.UPLOAD_DIR, rel);
  if (!full.startsWith(path.resolve(env.UPLOAD_DIR))) return null;
  return full;
}

export async function readUpload(url: string): Promise<Buffer | null> {
  const p = urlToPath(url);
  if (!p) return null;
  try {
    return await fs.readFile(p);
  } catch {
    return null;
  }
}

export async function removeUpload(...urls: (string | null | undefined)[]) {
  for (const u of urls) {
    const p = urlToPath(u);
    if (p) await fs.rm(p, { force: true }).catch(() => undefined);
  }
}
