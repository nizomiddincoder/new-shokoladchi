import PQueue from 'p-queue';
import sharp from 'sharp';
import { GoogleGenAI } from '@google/genai';
import { prisma } from '../db';
import { env } from '../env';
import { logger } from '../logger';
import { readUpload, removeUpload, saveImage } from './storage';

const PROMPT = [
  'Professional e-commerce product photo of this exact food product.',
  'Keep the product, packaging, labels, text, colors and proportions exactly as in the original — do not change, add or remove anything on the product.',
  'Background: pure solid white (#FFFFFF), completely clean and empty, no gradient, no texture, no props, no reflections.',
  'The product must be LARGE and fill about 85-90% of the frame, centered, close-up, so it is clearly recognizable — do not make the product small, do not leave large empty margins.',
  'Square 1:1, bright even studio lighting, only a very soft subtle shadow directly under the product, high detail, crisp sharp focus, high resolution, all label text clearly readable.',
].join(' ');

const TIMEOUT_MS = 60_000;
/** Yakuniy rasm o'lchami va mahsulot atrofidagi oq chet ulushi */
const OUT_SIZE = 1200;
const MARGIN = 0.05;

const queue = new PQueue({ concurrency: 2 });
export const geminiClient = env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: env.GEMINI_API_KEY, ...(env.GEMINI_BASE_URL ? { httpOptions: { baseUrl: env.GEMINI_BASE_URL } } : {}) })
  : null;
const client = geminiClient;

export const aiEnabled = () => !!client;

/**
 * Gemini natijasini tozalaydi: fon oq, ortiqcha oq chetlar kesiladi va mahsulot
 * kvadrat kadrning ~90% ini egallaydigan qilib kattalashtiriladi (tiniq ko'rinishi uchun).
 */
export async function fitProductOnWhite(input: Buffer): Promise<Buffer> {
  const flat = await sharp(input).rotate().flatten({ background: '#ffffff' }).png().toBuffer();
  let product = flat;
  try {
    const trimmed = await sharp(flat).trim({ background: '#ffffff', threshold: 20 }).png().toBuffer();
    const m = await sharp(trimmed).metadata();
    // Juda kichik bo'lib qolsa (deyarli bo'sh rasm) kesmaymiz
    if ((m.width || 0) >= 64 && (m.height || 0) >= 64) product = trimmed;
  } catch {
    /* butunlay bir xil rangli rasm — kesish shart emas */
  }
  const inner = Math.round(OUT_SIZE * (1 - 2 * MARGIN));
  const meta = await sharp(product).metadata();
  const enlarging = Math.max(meta.width || 0, meta.height || 0) < inner;
  let pipeline = sharp(product).resize(inner, inner, { fit: 'inside', kernel: 'lanczos3', background: '#ffffff' });
  if (enlarging) pipeline = pipeline.sharpen({ sigma: 0.7 });
  const resized = await pipeline.png().toBuffer();
  return sharp({ create: { width: OUT_SIZE, height: OUT_SIZE, channels: 3, background: '#ffffff' } })
    .composite([{ input: resized, gravity: 'center' }])
    .png()
    .toBuffer();
}

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Gemini timeout (${ms / 1000}s)`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

async function callGemini(input: Buffer): Promise<Buffer> {
  if (!client) throw new Error('GEMINI_API_KEY o\'rnatilmagan');
  const response = await withTimeout(
    client.models.generateContent({
      model: env.GEMINI_IMAGE_MODEL,
      contents: [
        {
          role: 'user',
          parts: [{ inlineData: { mimeType: 'image/webp', data: input.toString('base64') } }, { text: PROMPT }],
        },
      ],
      config: {
        responseModalities: ['IMAGE', 'TEXT'],
        imageConfig: { aspectRatio: '1:1', ...(env.GEMINI_IMAGE_SIZE ? { imageSize: env.GEMINI_IMAGE_SIZE } : {}) },
      },
    }),
    TIMEOUT_MS,
  );
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    if (part.inlineData?.data) return Buffer.from(part.inlineData.data, 'base64');
  }
  const text = parts.map((p) => p.text).filter(Boolean).join(' ').slice(0, 200);
  throw new Error(`Gemini rasm qaytarmadi${text ? ': ' + text : ''}`);
}

async function processImage(imageId: number) {
  const image = await prisma.productImage.findUnique({ where: { id: imageId } });
  if (!image) return;
  await prisma.productImage.update({ where: { id: imageId }, data: { aiStatus: 'PROCESSING', aiError: null } });
  const started = Date.now();
  try {
    const original = await readUpload(image.originalUrl);
    if (!original) throw new Error('Original rasm topilmadi');
    const result = await callGemini(original);
    const saved = await saveImage(await fitProductOnWhite(result), 'products', { quality: 92 });
    const old = await prisma.productImage.findUnique({ where: { id: imageId } });
    await prisma.productImage.update({
      where: { id: imageId },
      data: { aiStatus: 'DONE', aiUrl: saved.url, aiThumb: saved.thumbUrl, aiError: null },
    });
    if (old?.aiUrl) await removeUpload(old.aiUrl, old.aiThumb);
    await prisma.aiCall.create({
      data: { imageId, model: env.GEMINI_IMAGE_MODEL, success: true, durationMs: Date.now() - started },
    });
  } catch (err) {
    const message = (err as Error)?.message?.slice(0, 500) || 'Noma\'lum xato';
    logger.warn({ err: message, imageId }, 'Gemini ishlov berishda xato');
    await prisma.productImage
      .update({ where: { id: imageId }, data: { aiStatus: 'FAILED', aiError: message } })
      .catch(() => undefined);
    await prisma.aiCall
      .create({
        data: { imageId, model: env.GEMINI_IMAGE_MODEL, success: false, error: message, durationMs: Date.now() - started },
      })
      .catch(() => undefined);
  }
}

/** Rasmni AI navbatiga qo'shadi (kutmaydi) */
export async function enqueueAi(imageId: number) {
  if (!client) {
    await prisma.productImage.update({
      where: { id: imageId },
      data: { aiStatus: 'FAILED', aiError: 'AI o\'chirilgan (GEMINI_API_KEY yo\'q)', useAi: false },
    });
    return;
  }
  await prisma.productImage.update({ where: { id: imageId }, data: { aiStatus: 'PENDING', aiError: null } });
  void queue.add(() => processImage(imageId));
}

// ================= AI BANNER =================

/** Banner o'lchami: mini app'dagi banner nisbati 2.2:1 */
const BANNER_W = 1320;
const BANNER_H = 600;
const BANNER_TIMEOUT_MS = 90_000;

function bannerPrompt(description: string, headline: string, hasImages: boolean) {
  return [
    'Create a finished, professional, eye-catching promotional banner for the home screen of a grocery / chocolate shop mobile app.',
    'Wide horizontal format (about 2.2:1), high resolution, crisp and sharp.',
    hasImages
      ? 'Use the provided photos as the main subjects: keep every product exactly as it is (shape, packaging, labels, text, colors) — do not invent other products, do not distort them. Make the products large, clearly recognizable and well lit.'
      : 'Illustrate it with appetizing, realistic food products that match the description.',
    'Style: clean, modern, premium. Color palette based on chocolate brown #6F4E37, dark brown #4A3224, warm caramel #D9A066, cream #F3ECE6 and white.',
    'Balanced composition with soft studio lighting and a tasteful background; important content must stay away from the edges.',
    headline
      ? `Render this headline text exactly as written, correctly spelled, in a large bold clean sans-serif font with strong contrast: "${headline}". Do not add any other text.`
      : 'Do not add any text, letters, numbers or logos to the image.',
    'No watermarks, no borders, no UI elements, no mockup frames.',
    `Shop owner's description of the banner (may be in Uzbek): ${description}`,
  ].join(' ');
}

/** Bir nechta rasm va tavsif asosida tayyor banner yaratadi (sinxron, admin kutadi) */
export async function generateBanner(input: { description: string; headline?: string; imageUrls: string[] }) {
  if (!client) throw new Error('AI o\'chirilgan: GEMINI_API_KEY o\'rnatilmagan');
  const parts: { inlineData?: { mimeType: string; data: string }; text?: string }[] = [];
  for (const url of input.imageUrls.slice(0, 4)) {
    const buf = await readUpload(url);
    if (!buf) continue;
    // Gemini uchun hajmni kamaytiramiz
    const jpeg = await sharp(buf).rotate().resize(1280, 1280, { fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 88 }).toBuffer();
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: jpeg.toString('base64') } });
  }
  parts.push({ text: bannerPrompt(input.description.trim(), (input.headline || '').trim(), parts.length > 0) });

  const started = Date.now();
  try {
    const response = await withTimeout(
      client.models.generateContent({
        model: env.GEMINI_IMAGE_MODEL,
        contents: [{ role: 'user', parts }],
        config: {
          responseModalities: ['IMAGE', 'TEXT'],
          imageConfig: { aspectRatio: '21:9', ...(env.GEMINI_IMAGE_SIZE ? { imageSize: env.GEMINI_IMAGE_SIZE } : {}) },
        },
      }),
      BANNER_TIMEOUT_MS,
    );
    const out = (response.candidates?.[0]?.content?.parts ?? []).find((p) => p.inlineData?.data);
    if (!out?.inlineData?.data) {
      const text = (response.candidates?.[0]?.content?.parts ?? []).map((p) => p.text).filter(Boolean).join(' ').slice(0, 200);
      throw new Error(`Gemini banner qaytarmadi${text ? ': ' + text : ''}`);
    }
    const banner = await sharp(Buffer.from(out.inlineData.data, 'base64'))
      .resize(BANNER_W, BANNER_H, { fit: 'cover', position: 'centre', kernel: 'lanczos3' })
      .png()
      .toBuffer();
    const saved = await saveImage(banner, 'banners', { quality: 90, maxSize: BANNER_W });
    await prisma.aiCall.create({ data: { model: env.GEMINI_IMAGE_MODEL, success: true, durationMs: Date.now() - started } });
    return { url: saved.url, thumbUrl: saved.thumbUrl };
  } catch (err) {
    const message = (err as Error)?.message?.slice(0, 500) || 'Noma\'lum xato';
    await prisma.aiCall
      .create({ data: { model: env.GEMINI_IMAGE_MODEL, success: false, error: message, durationMs: Date.now() - started } })
      .catch(() => undefined);
    logger.warn({ err: message }, 'AI banner yaratilmadi');
    throw new Error(`AI banner yaratilmadi: ${message}`);
  }
}

// ================= KATEGORIYA RASMI =================

function categoryPrompt(nameUz: string, nameRu: string) {
  return [
    `Professional appetizing e-commerce photo representing the grocery store category "${nameUz}"${nameRu && nameRu !== nameUz ? ` (in Russian: "${nameRu}")` : ''}.`,
    'Show a neat, attractive arrangement of the most typical real products of this category, as one tight group.',
    'Background: pure solid white (#FFFFFF), clean and empty, no props, no text, no letters, no logos, no labels with words.',
    'The products must be large and fill about 85-90% of the square frame, centered, bright even studio lighting, crisp sharp focus, high detail.',
  ].join(' ');
}

async function processCategoryImage(categoryId: number) {
  if (!client) return;
  const cat = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!cat) return;
  await prisma.category.update({ where: { id: categoryId }, data: { imageStatus: 'PROCESSING' } });
  const started = Date.now();
  try {
    const response = await withTimeout(
      client.models.generateContent({
        model: env.GEMINI_IMAGE_MODEL,
        contents: [{ role: 'user', parts: [{ text: categoryPrompt(cat.nameUz, cat.nameRu) }] }],
        config: { responseModalities: ['IMAGE', 'TEXT'], imageConfig: { aspectRatio: '1:1' } },
      }),
      TIMEOUT_MS,
    );
    const out = (response.candidates?.[0]?.content?.parts ?? []).find((p) => p.inlineData?.data);
    if (!out?.inlineData?.data) throw new Error('Gemini rasm qaytarmadi');
    const saved = await saveImage(await fitProductOnWhite(Buffer.from(out.inlineData.data, 'base64')), 'categories', { quality: 90, maxSize: 600 });
    // Shu orada admin o'zi rasm yuklagan bo'lsa, AI rasm bilan almashtirmaymiz
    const res = await prisma.category.updateMany({
      where: { id: categoryId, imageStatus: 'PROCESSING' },
      data: { imageUrl: saved.url, imageStatus: 'DONE' },
    });
    if (res.count === 0) await removeUpload(saved.url, saved.thumbUrl);
    else if (cat.imageUrl?.startsWith('/uploads/categories/')) await removeUpload(cat.imageUrl);
    await prisma.aiCall.create({ data: { model: env.GEMINI_IMAGE_MODEL, success: true, durationMs: Date.now() - started } });
  } catch (err) {
    const message = (err as Error)?.message?.slice(0, 500) || 'xato';
    logger.warn({ err: message, categoryId }, 'Kategoriya rasmi yaratilmadi');
    await prisma.category.updateMany({ where: { id: categoryId, imageStatus: 'PROCESSING' }, data: { imageStatus: 'FAILED' } });
    await prisma.aiCall
      .create({ data: { model: env.GEMINI_IMAGE_MODEL, success: false, error: message, durationMs: Date.now() - started } })
      .catch(() => undefined);
  }
}

/** Kategoriya uchun AI rasm yaratishni navbatga qo'yadi (rasm yuklanmagan bo'lsa) */
export async function enqueueCategoryImage(categoryId: number) {
  if (!client) return false;
  await prisma.category.update({ where: { id: categoryId }, data: { imageStatus: 'PENDING' } });
  void queue.add(() => processCategoryImage(categoryId));
  return true;
}

/** Rasmsiz kategoriyalarga (masalan seed qilinganlar) avtomatik rasm yaratadi */
export async function fillMissingCategoryImages() {
  if (!client) return;
  const cats = await prisma.category.findMany({
    where: { OR: [{ imageUrl: null, imageStatus: 'NONE' }, { imageStatus: { in: ['PENDING', 'PROCESSING'] } }] },
    select: { id: true },
  });
  for (const c of cats) await enqueueCategoryImage(c.id);
  if (cats.length) logger.info({ count: cats.length }, 'Kategoriya rasmlari navbatga qo\'yildi');
}

/** Server qayta ishga tushganda yarim qolgan vazifalarni navbatga qaytaradi */
export async function resumePendingAi() {
  const pending = await prisma.productImage.findMany({
    where: { aiStatus: { in: ['PENDING', 'PROCESSING'] } },
    select: { id: true },
  });
  for (const p of pending) await enqueueAi(p.id);
  if (pending.length) logger.info({ count: pending.length }, 'AI navbati tiklandi');
}

// ================= "MENING SHOKOLADIM": FONNI OLIB TASHLASH =================

const CUTOUT_TIMEOUT_MS = 60_000;
const CUTOUT_MAX = 1400;
/** Kalit rang: odamlar suratida deyarli uchramaydigan sof magenta */
const KEY_PROMPT = [
  'Cut out the main subject(s) of this photo — the person or people (with their full hair), or pets / the main foreground object if there are no people.',
  'Replace the ENTIRE background with one perfectly flat, uniform, solid pure magenta color (#FF00FF): no gradient, no shadow, no texture, no vignette, no floor, no other objects.',
  'Keep the subject absolutely identical to the original: same face and identity, expression, pose, clothes, colors, lighting and proportions. Do not beautify, do not redraw, do not add or remove anything, do not crop the subject.',
  'Keep the same framing and composition as the original photo. Edges must be clean, smooth and precise, especially around hair and shoulders.',
].join(' ');

/** Rasm nisbatiga eng yaqin Gemini formatini tanlaydi */
function nearestAspect(w: number, h: number) {
  const options: [string, number][] = [
    ['1:1', 1],
    ['3:4', 3 / 4],
    ['4:3', 4 / 3],
    ['9:16', 9 / 16],
    ['16:9', 16 / 9],
    ['2:3', 2 / 3],
    ['3:2', 3 / 2],
  ];
  const r = w / h;
  return options.reduce((best, o) => (Math.abs(Math.log(o[1] / r)) < Math.abs(Math.log(best[1] / r)) ? o : best))[0];
}

/**
 * Magenta fonni shaffoflikka aylantiradi:
 *  1) chetlardan boshlab kuchli magenta piksellarni "flood fill" bilan fon deb belgilaymiz
 *     (ichkaridagi binafsha kiyim kabi narsalar saqlanib qoladi);
 *  2) juda sof magenta (masalan qo'l va tana orasidagi bo'shliq) ham fon;
 *  3) fonga tegib turgan chet piksellar yumshoq shaffof bo'ladi va pushti "dog'" olib tashlanadi.
 */
export async function magentaToAlpha(input: Buffer) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const n = w * h;
  const m = new Int16Array(n); // magenta kuchi: min(r,b) - g
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    m[i] = Math.min(data[o], data[o + 2]) - data[o + 1];
  }
  const SEED = 110;
  const PURE = 190;
  const bg = new Uint8Array(n);
  const stack: number[] = [];
  const push = (i: number) => {
    if (!bg[i] && m[i] > SEED) {
      bg[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i < n - w) push(i + w);
  }
  for (let i = 0; i < n; i++) if (m[i] > PURE) bg[i] = 1;

  // Fonga yaqin (2 px) piksellar — chet zonasi
  const near = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!bg[i]) continue;
    const x = i % w;
    const y = (i - x) / w;
    for (let dy = -2; dy <= 2; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= h) continue;
      for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx;
        if (xx >= 0 && xx < w) near[yy * w + xx] = 1;
      }
    }
  }

  const alpha = Buffer.alloc(n);
  const rgb = Buffer.alloc(n * 3);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    let r = data[o];
    const g = data[o + 1];
    let b = data[o + 2];
    let a = 255;
    if (bg[i]) a = 0;
    else if (near[i] && m[i] > 30) {
      // Chet: magenta qancha ko'p bo'lsa, shuncha shaffof; rang "tozalanadi"
      a = Math.round(255 * Math.max(0, Math.min(1, (PURE - m[i]) / (PURE - 30))));
      r = Math.max(g, r - m[i]);
      b = Math.max(g, b - m[i]);
    }
    alpha[i] = a;
    rgb[i * 3] = r;
    rgb[i * 3 + 1] = g;
    rgb[i * 3 + 2] = b;
  }
  return { rgb, alpha, w, h };
}

/**
 * Mijoz rasmidan odam(lar)ni qirqib oladi va shaffof fonli PNG qaytaradi.
 * Bo'sh chetlar kesiladi; rasm chetiga tegib turgan joylar (masalan yelka) yumshoq so'nib boradi —
 * shablonga qo'yilganda tekis kesilgan chiziq ko'rinmaydi.
 */
export async function cutoutSubject(input: Buffer): Promise<Buffer> {
  if (!client) throw new Error('AI o\'chirilgan: GEMINI_API_KEY o\'rnatilmagan');
  const src = await sharp(input).rotate().resize(1536, 1536, { fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).toBuffer();
  const meta = await sharp(src).metadata();
  const started = Date.now();
  try {
    const response = await withTimeout(
      client.models.generateContent({
        model: env.GEMINI_IMAGE_MODEL,
        contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/jpeg', data: src.toString('base64') } }, { text: KEY_PROMPT }] }],
        config: { responseModalities: ['IMAGE', 'TEXT'], imageConfig: { aspectRatio: nearestAspect(meta.width || 1, meta.height || 1) } },
      }),
      CUTOUT_TIMEOUT_MS,
    );
    const out = (response.candidates?.[0]?.content?.parts ?? []).find((p) => p.inlineData?.data);
    if (!out?.inlineData?.data) throw new Error('Gemini rasm qaytarmadi');

    const { rgb, alpha, w, h } = await magentaToAlpha(Buffer.from(out.inlineData.data, 'base64'));

    // Ob'ekt chegarasi (bo'sh shaffof chetlarni kesish uchun)
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (alpha[y * w + x] > 24) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0 || (maxX - minX) * (maxY - minY) < w * h * 0.02) throw new Error('Rasmda odam topilmadi');

    // Chetga tegib turgan tomonlar yumshoq so'nadi (tekis kesilgan chiziq qolmasin)
    const fadeEdge = (touch: boolean, len: number, fn: (k: number, t: number) => void) => {
      if (!touch || len < 4) return;
      for (let k = 0; k < len; k++) fn(k, (k + 1) / (len + 1));
    };
    const fy = Math.round(h * 0.09);
    const fx = Math.round(w * 0.05);
    fadeEdge(maxY >= h - 3, fy, (k, t) => {
      const y = h - 1 - k;
      for (let x = 0; x < w; x++) alpha[y * w + x] = Math.round(alpha[y * w + x] * t);
    });
    fadeEdge(minX <= 2, fx, (k, t) => {
      for (let y = 0; y < h; y++) alpha[y * w + k] = Math.round(alpha[y * w + k] * t);
    });
    fadeEdge(maxX >= w - 3, fx, (k, t) => {
      const x = w - 1 - k;
      for (let y = 0; y < h; y++) alpha[y * w + x] = Math.round(alpha[y * w + x] * t);
    });

    // Chetlarni biroz silliqlash
    const softAlpha = await sharp(alpha, { raw: { width: w, height: h, channels: 1 } }).blur(0.6).raw().toBuffer();
    const pad = 4;
    const left = Math.max(0, minX - pad);
    const top = Math.max(0, minY - pad);
    const png = await sharp(rgb, { raw: { width: w, height: h, channels: 3 } })
      .joinChannel(softAlpha, { raw: { width: w, height: h, channels: 1 } })
      .extract({ left, top, width: Math.min(w, maxX + pad + 1) - left, height: Math.min(h, maxY + pad + 1) - top })
      .resize(CUTOUT_MAX, CUTOUT_MAX, { fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 8 })
      .toBuffer();
    await prisma.aiCall.create({ data: { model: env.GEMINI_IMAGE_MODEL, success: true, durationMs: Date.now() - started } });
    return png;
  } catch (err) {
    const message = (err as Error)?.message?.slice(0, 500) || 'Noma\'lum xato';
    await prisma.aiCall
      .create({ data: { model: env.GEMINI_IMAGE_MODEL, success: false, error: `cutout: ${message}`, durationMs: Date.now() - started } })
      .catch(() => undefined);
    logger.warn({ err: message }, 'Fonni olib tashlab bo\'lmadi');
    throw new Error(message);
  }
}

export async function aiMonthlyStats() {
  const ym = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit' }).format(new Date());
  const monthStart = new Date(`${ym}-01T00:00:00+05:00`);
  const [total, success] = await Promise.all([
    prisma.aiCall.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.aiCall.count({ where: { createdAt: { gte: monthStart }, success: true } }),
  ]);
  return { total, success, failed: total - success, queue: queue.size + queue.pending, enabled: aiEnabled(), model: env.GEMINI_IMAGE_MODEL };
}
