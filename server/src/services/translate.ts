import PQueue from 'p-queue';
import { prisma } from '../db';
import { env } from '../env';
import { logger } from '../logger';
import { geminiClient, withTimeout } from './ai';

/**
 * O'zbekcha (lotin) matnni ruschaga avtomatik tarjima qilish (Gemini).
 * Xodimlar faqat o'zbekcha kiritadi; ruscha maydonlar fonda to'ldiriladi.
 * Kalit bo'lmasa yoki xato bo'lsa, ruscha maydonda o'zbekcha matn qoladi.
 */

const TIMEOUT_MS = 25_000;
const queue = new PQueue({ concurrency: 2 });

const INSTRUCTION = [
  'You are a professional translator for a grocery / food store in Uzbekistan.',
  'Translate every value of the given JSON object from Uzbek (Latin script) into natural, correct Russian.',
  'Keep brand names, numbers, percentages and units (kg, g, l, ml, dona → шт) meaningful; do not add explanations.',
  'Product names must be short and natural as on a Russian store shelf (e.g. "Mol go\'shti (lahm)" → "Говядина (мякоть)").',
  'Return ONLY a JSON object with exactly the same keys and the translated string values. Empty strings stay empty.',
].join(' ');

export async function translateUzToRu<K extends string>(fields: Record<K, string>): Promise<Record<K, string> | null> {
  const keys = (Object.keys(fields) as K[]).filter((k) => fields[k]?.trim());
  if (!keys.length) return Object.fromEntries(Object.keys(fields).map((k) => [k, ''])) as Record<K, string>;
  if (!geminiClient) return null;
  const input = Object.fromEntries(keys.map((k) => [k, fields[k].trim()]));
  const started = Date.now();
  try {
    const res = await withTimeout(
      geminiClient.models.generateContent({
        model: env.GEMINI_TEXT_MODEL,
        contents: [{ role: 'user', parts: [{ text: `${INSTRUCTION}\n\nJSON:\n${JSON.stringify(input)}` }] }],
        config: { responseMimeType: 'application/json', temperature: 0.2 },
      }),
      TIMEOUT_MS,
    );
    const raw = (res.text || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out = {} as Record<K, string>;
    for (const k of Object.keys(fields) as K[]) {
      const v = parsed[k];
      out[k] = typeof v === 'string' && v.trim() ? v.trim().slice(0, 3000) : fields[k] || '';
    }
    await prisma.aiCall
      .create({ data: { model: env.GEMINI_TEXT_MODEL, success: true, durationMs: Date.now() - started } })
      .catch(() => undefined);
    return out;
  } catch (err) {
    const message = (err as Error)?.message?.slice(0, 300) || 'xato';
    logger.warn({ err: message }, 'Tarjima amalga oshmadi');
    await prisma.aiCall
      .create({ data: { model: env.GEMINI_TEXT_MODEL, success: false, error: message, durationMs: Date.now() - started } })
      .catch(() => undefined);
    return null;
  }
}

async function translateProduct(id: number) {
  const p = await prisma.product.findUnique({ where: { id }, select: { nameUz: true, descriptionUz: true } });
  if (!p) return;
  const r = await translateUzToRu({ name: p.nameUz, description: p.descriptionUz });
  if (!r) return;
  // O'zbekcha matn shu orada o'zgarmagan bo'lsagina yozamiz
  await prisma.product.updateMany({
    where: { id, nameUz: p.nameUz, descriptionUz: p.descriptionUz },
    data: { nameRu: r.name, descriptionRu: r.description },
  });
}

async function translateCategory(id: number) {
  const c = await prisma.category.findUnique({ where: { id }, select: { nameUz: true } });
  if (!c) return;
  const r = await translateUzToRu({ name: c.nameUz });
  if (!r) return;
  await prisma.category.updateMany({ where: { id, nameUz: c.nameUz }, data: { nameRu: r.name } });
}

async function translateBanner(id: number) {
  const b = await prisma.banner.findUnique({ where: { id }, select: { titleUz: true } });
  if (!b) return;
  const r = await translateUzToRu({ title: b.titleUz });
  if (!r) return;
  await prisma.banner.updateMany({ where: { id, titleUz: b.titleUz }, data: { titleRu: r.title } });
}

async function translateTemplate(id: number) {
  const t = await prisma.personalTemplate.findUnique({ where: { id }, select: { titleUz: true } });
  if (!t) return;
  const r = await translateUzToRu({ title: t.titleUz });
  if (!r) return;
  await prisma.personalTemplate.updateMany({ where: { id, titleUz: t.titleUz }, data: { titleRu: r.title } });
}

const JOBS = { product: translateProduct, category: translateCategory, banner: translateBanner, template: translateTemplate };

/** Fonda tarjima qiladi (saqlash tarjimani kutmaydi) */
export function enqueueTranslation(entity: keyof typeof JOBS, id: number) {
  if (!geminiClient) return;
  void queue.add(() => JOBS[entity](id).catch((err) => logger.warn({ err, entity, id }, 'Tarjima vazifasida xato')));
}
