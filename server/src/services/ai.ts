import PQueue from 'p-queue';
import { GoogleGenAI } from '@google/genai';
import { prisma } from '../db';
import { env } from '../env';
import { logger } from '../logger';
import { readUpload, removeUpload, saveImage } from './storage';

const PROMPT =
  'Professional e-commerce product photo of this exact food product. Keep the product, packaging, labels, text, colors and proportions exactly as in the original — do not change, add or remove anything on the product. Replace background with clean soft light-beige studio background, soft natural shadow, centered, square 1:1, studio lighting, high detail, sharp focus.';

const TIMEOUT_MS = 60_000;

const queue = new PQueue({ concurrency: 2 });
const client = env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: env.GEMINI_API_KEY }) : null;

export const aiEnabled = () => !!client;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
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
      config: { responseModalities: ['IMAGE', 'TEXT'] },
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
    const saved = await saveImage(result, 'products');
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

/** Server qayta ishga tushganda yarim qolgan vazifalarni navbatga qaytaradi */
export async function resumePendingAi() {
  const pending = await prisma.productImage.findMany({
    where: { aiStatus: { in: ['PENDING', 'PROCESSING'] } },
    select: { id: true },
  });
  for (const p of pending) await enqueueAi(p.id);
  if (pending.length) logger.info({ count: pending.length }, 'AI navbati tiklandi');
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
