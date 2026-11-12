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
//
// Gemini rasmni QAYTA CHIZMAYDI: u faqat odamning niqobini (segmentation mask) qaytaradi —
// qaysi piksel odamga tegishli. Niqob asl rasmga qo'llanadi, shuning uchun yuz, teri, kiyim
// asl holicha qoladi (rang sachrashi, xiralashish, "boshqa odam" bo'lib qolish bo'lmaydi).
// Niqob chetlari asl rasmdagi qirralar bo'yicha aniqlashtiriladi (guided filter) — soch, yelka toza chiqadi.

const SEG_TIMEOUT_MS = 45_000;
const CUTOUT_MAX = 1400;
/** Segmentatsiya uchun rasm o'lchami (Gemini tavsiyasi ~1024) */
const SEG_INPUT = 1024;

function segPrompt(retry: boolean) {
  return [
    'Give the segmentation mask of the person (or people) in this photo.',
    'Each mask must cover the WHOLE person as one object: head, all of the hair, face, ears, neck, shoulders, arms, hands, body and all clothes, plus anything the person is holding.',
    'Do NOT include anything from the background: walls, shelves, lamps, furniture, products, other blurred objects.',
    'If there are no people, give the mask of the single main foreground subject (pet or object) instead.',
    'Output a JSON list of segmentation masks where each entry contains the 2D bounding box in the key "box_2d", the segmentation mask in key "mask", and the text label in the key "label".',
    retry ? 'Be precise: the previous mask was incomplete or included background. Cover the entire person and nothing else.' : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export class CutoutError extends Error {}

type SegItem = { box_2d: number[]; mask: string; label?: string };

/** Gemini javobidan JSON ro'yxatni ajratib oladi (```json ... ``` bo'lsa ham) */
export function parseSegments(text: string): SegItem[] {
  const t = text.trim();
  const s = t.indexOf('[');
  const e = t.lastIndexOf(']');
  if (s < 0 || e <= s) throw new CutoutError('Gemini niqob qaytarmadi');
  let arr: unknown;
  try {
    arr = JSON.parse(t.slice(s, e + 1));
  } catch {
    throw new CutoutError('Gemini javobini o\'qib bo\'lmadi');
  }
  if (!Array.isArray(arr)) throw new CutoutError('Gemini niqob qaytarmadi');
  return (arr as SegItem[]).filter((x) => Array.isArray(x?.box_2d) && x.box_2d.length === 4 && typeof x?.mask === 'string' && x.mask.length > 20);
}

/** Niqoblarni (har biri o'z qutisida) to'liq rasm o'lchamidagi bitta niqobga yig'adi: 0..1 */
export async function assembleMask(items: SegItem[], W: number, H: number): Promise<Float32Array> {
  const mask = new Float32Array(W * H);
  for (const it of items) {
    const [y0, x0, y1, x1] = it.box_2d.map(Number);
    const left = Math.max(0, Math.round((Math.min(x0, x1) / 1000) * W));
    const top = Math.max(0, Math.round((Math.min(y0, y1) / 1000) * H));
    const right = Math.min(W, Math.round((Math.max(x0, x1) / 1000) * W));
    const bottom = Math.min(H, Math.round((Math.max(y0, y1) / 1000) * H));
    const bw = right - left;
    const bh = bottom - top;
    if (bw < 4 || bh < 4) continue;
    let raw: Buffer;
    try {
      const png = Buffer.from(it.mask.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      raw = await sharp(png).removeAlpha().toColourspace('b-w').resize(bw, bh, { fit: 'fill', kernel: 'cubic' }).raw().toBuffer();
    } catch {
      continue;
    }
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        // Ehtimollik xaritasi: ~0.5 chegarasi atrofida yumshoq o'tish
        const v = Math.max(0, Math.min(1, (raw[y * bw + x] / 255 - 0.3) / 0.4));
        const i = (top + y) * W + left + x;
        if (v > mask[i]) mask[i] = v;
      }
    }
  }
  return mask;
}

/** Tez o'rtacha filtr (integral rasm orqali), radius r */
function boxFilter(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const W1 = w + 1;
  const I = new Float64Array(W1 * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += src[y * w + x];
      I[(y + 1) * W1 + x + 1] = I[y * W1 + x + 1] + row;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const ya = Math.max(0, y - r);
    const yb = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x++) {
      const xa = Math.max(0, x - r);
      const xb = Math.min(w - 1, x + r);
      const sum = I[(yb + 1) * W1 + xb + 1] - I[ya * W1 + xb + 1] - I[(yb + 1) * W1 + xa] + I[ya * W1 + xa];
      out[y * w + x] = sum / ((yb - ya + 1) * (xb - xa + 1));
    }
  }
  return out;
}

/**
 * Guided filter (He va boshq.): qo'pol niqobni asl rasmdagi qirralarga "yopishtiradi".
 * Natija: soch, yelka va kiyim chetlari asl rasmdagi chegaraga mos, yumshoq va aniq.
 */
export function refineMask(gray: Float32Array, p: Float32Array, w: number, h: number) {
  const r = Math.max(4, Math.round(Math.min(w, h) * 0.008));
  const eps = 1e-3;
  const n = w * h;
  const Ip = new Float32Array(n);
  const II = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    Ip[i] = gray[i] * p[i];
    II[i] = gray[i] * gray[i];
  }
  const mI = boxFilter(gray, w, h, r);
  const mP = boxFilter(p, w, h, r);
  const mIp = boxFilter(Ip, w, h, r);
  const mII = boxFilter(II, w, h, r);
  const a = new Float32Array(n);
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const varI = mII[i] - mI[i] * mI[i];
    a[i] = (mIp[i] - mI[i] * mP[i]) / (varI + eps);
    b[i] = mP[i] - a[i] * mI[i];
  }
  const mA = boxFilter(a, w, h, r);
  const mB = boxFilter(b, w, h, r);
  // Faqat chet zonasida aniqlashtiramiz: niqobning ichi to'liq, tashqarisi to'liq shaffof qoladi
  const band = boxFilter(p, w, h, r * 2);
  const alpha = Buffer.alloc(n);
  for (let i = 0; i < n; i++) {
    let v: number;
    if (band[i] >= 0.995) v = 1;
    else if (band[i] <= 0.005) v = 0;
    else v = Math.max(0, Math.min(1, mA[i] * gray[i] + mB[i]));
    alpha[i] = Math.round(v * 255);
  }
  return alpha;
}

async function requestSegments(img: Buffer, retry: boolean): Promise<SegItem[]> {
  if (!client) throw new Error('AI o\'chirilgan: GEMINI_API_KEY o\'rnatilmagan');
  const response = await withTimeout(
    client.models.generateContent({
      model: env.GEMINI_SEGMENT_MODEL,
      contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/jpeg', data: img.toString('base64') } }, { text: segPrompt(retry) }] }],
      // Segmentatsiya uchun "o'ylash" o'chiriladi — Google tavsiyasi, natija aniqroq va tezroq
      config: { temperature: 0.3, thinkingConfig: { thinkingBudget: 0 } },
    }),
    SEG_TIMEOUT_MS,
  );
  const items = parseSegments(response.text || '');
  if (!items.length) throw new CutoutError('Rasmda odam topilmadi');
  return items;
}

/**
 * Mijoz rasmidan odam(lar)ni qirqib oladi va shaffof fonli PNG qaytaradi (asl piksellar bilan).
 * Bo'sh chetlar kesiladi; rasm chetiga tegib turgan joylar (masalan yelka) yumshoq so'nib boradi.
 * Niqob sifatsiz bo'lsa bir marta qayta so'raladi; baribir bo'lmasa xato — mijozda asl rasm qoladi.
 */
export async function cutoutSubject(input: Buffer): Promise<Buffer> {
  if (!client) throw new Error('AI o\'chirilgan: GEMINI_API_KEY o\'rnatilmagan');
  // Asl rasm (to'g'ri burilgan, o'lchami cheklangan) — natija shu piksellardan olinadi
  const { data: rgb, info } = await sharp(input)
    .rotate()
    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const n = w * h;
  const forModel = await sharp(rgb, { raw: { width: w, height: h, channels: 3 } })
    .resize(SEG_INPUT, SEG_INPUT, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  const gray = new Float32Array(n);
  for (let i = 0; i < n; i++) gray[i] = (0.299 * rgb[i * 3] + 0.587 * rgb[i * 3 + 1] + 0.114 * rgb[i * 3 + 2]) / 255;

  const started = Date.now();
  let lastError = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const items = await requestSegments(forModel, attempt > 0);
      const coarse = await assembleMask(items, w, h);
      const alpha = refineMask(gray, coarse, w, h);

      // Tekshiruv: odam juda kichik yoki butun rasm bo'lib qolmasin
      let opaque = 0;
      let minX = w, minY = h, maxX = -1, maxY = -1;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const a = alpha[y * w + x];
          if (a > 128) opaque++;
          if (a > 24) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      const frac = opaque / n;
      logger.info({ attempt: attempt + 1, masks: items.length, labels: items.map((i) => i.label).slice(0, 5), frac: +frac.toFixed(2) }, 'Odam niqobi olindi');
      if (maxX < 0 || frac < 0.04) throw new CutoutError('Rasmda odam topilmadi');
      if (frac > 0.95) throw new CutoutError('Niqob butun rasmni qopladi');

      // Chetga tegib turgan tomonlar yumshoq so'nadi (tekis kesilgan chiziq qolmasin)
      const fadeEdge = (touch: boolean, len: number, fn: (k: number, t: number) => void) => {
        if (!touch || len < 4) return;
        for (let k = 0; k < len; k++) fn(k, (k + 1) / (len + 1));
      };
      const fy = Math.round(h * 0.08);
      const fx = Math.round(w * 0.04);
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

      const pad = 4;
      const left = Math.max(0, minX - pad);
      const top = Math.max(0, minY - pad);
      const png = await sharp(rgb, { raw: { width: w, height: h, channels: 3 } })
        .joinChannel(alpha, { raw: { width: w, height: h, channels: 1 } })
        .extract({ left, top, width: Math.min(w, maxX + pad + 1) - left, height: Math.min(h, maxY + pad + 1) - top })
        .resize(CUTOUT_MAX, CUTOUT_MAX, { fit: 'inside', withoutEnlargement: true })
        .png({ compressionLevel: 8 })
        .toBuffer();
      await prisma.aiCall.create({ data: { model: env.GEMINI_SEGMENT_MODEL, success: true, durationMs: Date.now() - started } });
      return png;
    } catch (err) {
      lastError = (err as Error)?.message?.slice(0, 500) || 'Noma\'lum xato';
      logger.warn({ err: lastError, attempt: attempt + 1 }, 'Fonni olib tashlab bo\'lmadi');
      if (!(err instanceof CutoutError)) break;
    }
  }
  await prisma.aiCall
    .create({ data: { model: env.GEMINI_SEGMENT_MODEL, success: false, error: `cutout: ${lastError}`, durationMs: Date.now() - started } })
    .catch(() => undefined);
  throw new Error(lastError);
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
