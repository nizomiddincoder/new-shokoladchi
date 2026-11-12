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
/** Ikkinchi urinish: fon rangi bo'yicha qat'iyroq talab */
const KEY_PROMPT_STRICT =
  'IMPORTANT: the previous result had a shaded or pinkish background. The background must be EXACTLY one flat color #FF00FF (RGB 255,0,255) on every single background pixel, edge to edge, with zero lighting variation. Nothing else may be in the background.';

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

/** RGB (0..255) -> HSV: h 0..360, s 0..1, v 0..1 */
function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max / 255];
}

const hueDist = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

export class CutoutError extends Error {}

/**
 * Bir xil rangli (kalit) fonni shaffoflikka aylantiradi.
 *
 * Gemini fonni har doim ham aynan #FF00FF qilib bermaydi — ko'pincha och-pushti, qizg'ish yoki
 * soyali (gradient) bo'ladi. Shuning uchun fon rangi qat'iy emas, rasmning o'zidan aniqlanadi:
 *  1) yuqori va yon chetlardagi piksellardan eng ko'p uchraydigan rang toni (hue) — fon rangi;
 *  2) chetlardan boshlab shu tonga yaqin piksellar "flood fill" bilan fon deb belgilanadi
 *     (odam ichidagi o'xshash rangli narsalar saqlanib qoladi);
 *  3) fonga juda mos yopiq bo'shliqlar (qo'l va tana orasi) ham fon;
 *  4) chet piksellar yumshoq shaffof bo'ladi va fon rangining "dog'i" (spill) tozalanadi;
 *  5) natija tekshiriladi: fon to'liq olinmagan bo'lsa — xato (rangli fon hech qachon qaytmaydi).
 */
export async function keyToAlpha(input: Buffer) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const n = w * h;
  const H = new Float32Array(n);
  const S = new Float32Array(n);
  const V = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const [hh, ss, vv] = rgbToHsv(data[o], data[o + 1], data[o + 2]);
    H[i] = hh;
    S[i] = ss;
    V[i] = vv;
  }

  // --- 1) Fon rangini chetlardan aniqlash (pastki chet olinmaydi — u yerda odatda odam bo'ladi)
  const depth = Math.max(2, Math.round(Math.min(w, h) * 0.012));
  const sample: number[] = [];
  for (let y = 0; y < depth; y++) for (let x = 0; x < w; x++) sample.push(y * w + x);
  for (let y = depth; y < Math.round(h * 0.8); y++)
    for (let k = 0; k < depth; k++) {
      sample.push(y * w + k);
      sample.push(y * w + (w - 1 - k));
    }
  const bins = new Array(36).fill(0);
  for (const i of sample) if (S[i] > 0.2 && V[i] > 0.15) bins[Math.floor(H[i] / 10) % 36]++;
  let best = 0;
  let bestCount = -1;
  for (let b = 0; b < 36; b++) {
    const c = bins[(b + 35) % 36] + bins[b] + bins[(b + 1) % 36];
    if (c > bestCount) {
      bestCount = c;
      best = b;
    }
  }
  if (bestCount < sample.length * 0.5) throw new CutoutError('Fon bir xil rangda emas');
  const inKeyBin = (i: number) => S[i] > 0.2 && V[i] > 0.15 && hueDist(H[i], best * 10 + 5) <= 15;
  // Doiraviy o'rtacha ton
  let sx = 0;
  let sy = 0;
  const keyPix: number[] = [];
  for (const i of sample)
    if (inKeyBin(i)) {
      keyPix.push(i);
      sx += Math.cos((H[i] * Math.PI) / 180);
      sy += Math.sin((H[i] * Math.PI) / 180);
    }
  let keyH = (Math.atan2(sy, sx) * 180) / Math.PI;
  if (keyH < 0) keyH += 360;
  const median = (arr: number[]) => {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)] ?? 0;
  };
  const keyS = median(keyPix.map((i) => S[i]));
  const keyV = median(keyPix.map((i) => V[i]));
  const hueStd = Math.sqrt(keyPix.reduce((acc, i) => acc + hueDist(H[i], keyH) ** 2, 0) / Math.max(1, keyPix.length));
  const tol = Math.min(26, Math.max(12, hueStd * 2.5 + 8));
  const minS = Math.max(0.15, keyS * 0.45);
  const minV = Math.max(0.1, keyV * 0.35);
  const bgLike = (i: number) => S[i] >= minS && V[i] >= minV && hueDist(H[i], keyH) <= tol;
  const strong = (i: number) => S[i] >= keyS * 0.7 && V[i] >= keyV * 0.5 && hueDist(H[i], keyH) <= tol * 0.6;

  // --- 2) Chetlardan flood fill
  const bg = new Uint8Array(n);
  const stack: number[] = [];
  const push = (i: number) => {
    if (!bg[i] && bgLike(i)) {
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
  // --- 3) Yopiq bo'shliqlar
  for (let i = 0; i < n; i++) if (!bg[i] && strong(i)) bg[i] = 1;

  // --- 4) Chet zonasi (fondan 2 px gacha)
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
    let g = data[o + 1];
    let b = data[o + 2];
    let a = 255;
    if (bg[i]) a = 0;
    else if (near[i]) {
      // Fon rangiga qanchalik yaqin bo'lsa, shuncha shaffof va kulrangga yaqinlashtiriladi (spill yo'qoladi)
      const hueK = Math.max(0, 1 - hueDist(H[i], keyH) / (tol * 1.8));
      const satK = Math.min(1, S[i] / Math.max(0.05, keyS));
      const k = hueK * satK;
      if (k > 0) {
        a = Math.round(255 * Math.max(0, Math.min(1, 1 - k)));
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        r = Math.round(r + (gray - r) * k);
        g = Math.round(g + (gray - g) * k);
        b = Math.round(b + (gray - b) * k);
      }
    }
    alpha[i] = a;
    rgb[i * 3] = r;
    rgb[i * 3 + 1] = g;
    rgb[i * 3 + 2] = b;
  }

  // --- 5) Tekshiruv: yuqori/yon chetlar va umumiy maydon shaffof bo'lishi shart
  let edgeClear = 0;
  for (const i of sample) if (alpha[i] < 40) edgeClear++;
  let clear = 0;
  for (let i = 0; i < n; i++) if (alpha[i] < 40) clear++;
  const stats = { keyH: Math.round(keyH), keyS: +keyS.toFixed(2), keyV: +keyV.toFixed(2), tol: +tol.toFixed(1), edgeClear: +(edgeClear / sample.length).toFixed(2), clear: +(clear / n).toFixed(2) };
  if (edgeClear / sample.length < 0.6 || clear / n < 0.08) throw new CutoutError(`Fon to'liq olib tashlanmadi (${JSON.stringify(stats)})`);
  return { rgb, alpha, w, h, stats };
}

/**
 * Mijoz rasmidan odam(lar)ni qirqib oladi va shaffof fonli PNG qaytaradi.
 * Bo'sh chetlar kesiladi; rasm chetiga tegib turgan joylar (masalan yelka) yumshoq so'nib boradi —
 * shablonga qo'yilganda tekis kesilgan chiziq ko'rinmaydi.
 * Gemini fonni yaxshi bermasa — bir marta qayta so'raladi; baribir bo'lmasa xato (mijozda asl rasm qoladi).
 */
export async function cutoutSubject(input: Buffer): Promise<Buffer> {
  if (!client) throw new Error('AI o\'chirilgan: GEMINI_API_KEY o\'rnatilmagan');
  const src = await sharp(input).rotate().resize(1536, 1536, { fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).toBuffer();
  const meta = await sharp(src).metadata();
  const started = Date.now();
  const ATTEMPTS = 2;
  let lastError = '';
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const prompt = attempt === 1 ? KEY_PROMPT : `${KEY_PROMPT} ${KEY_PROMPT_STRICT}`;
      const response = await withTimeout(
        client.models.generateContent({
          model: env.GEMINI_IMAGE_MODEL,
          contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/jpeg', data: src.toString('base64') } }, { text: prompt }] }],
          config: { responseModalities: ['IMAGE', 'TEXT'], imageConfig: { aspectRatio: nearestAspect(meta.width || 1, meta.height || 1) } },
        }),
        CUTOUT_TIMEOUT_MS,
      );
      const out = (response.candidates?.[0]?.content?.parts ?? []).find((p) => p.inlineData?.data);
      if (!out?.inlineData?.data) throw new CutoutError('Gemini rasm qaytarmadi');

      const { rgb, alpha, w, h, stats } = await keyToAlpha(Buffer.from(out.inlineData.data, 'base64'));
      logger.info({ attempt, ...stats }, 'Fon olib tashlandi');

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
      if (maxX < 0 || (maxX - minX) * (maxY - minY) < w * h * 0.02) throw new CutoutError('Rasmda odam topilmadi');

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
      lastError = (err as Error)?.message?.slice(0, 500) || 'Noma\'lum xato';
      logger.warn({ err: lastError, attempt }, 'Fonni olib tashlab bo\'lmadi');
      // Faqat natija sifatsiz bo'lsa qayta urinamiz (timeout/kalit xatosida emas)
      if (!(err instanceof CutoutError)) break;
    }
  }
  await prisma.aiCall
    .create({ data: { model: env.GEMINI_IMAGE_MODEL, success: false, error: `cutout: ${lastError}`, durationMs: Date.now() - started } })
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
