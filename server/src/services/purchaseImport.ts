import type ExcelJS from 'exceljs';
import type { Prisma, Unit } from '@prisma/client';
import { prisma } from '../db';
import { env } from '../env';
import { logger } from '../logger';
import { round3, toNum } from '../lib/format';
import { audit } from '../lib/audit';
import type { Actor } from '../lib/auth';
import { geminiClient, withTimeout } from './ai';
import { enqueueTranslation } from './translate';
import { CategoryGuesser, parsePurchaseSheet, productKey, type CategoryRef, type PurchaseRow } from './purchaseParse';
import type { ImportResult } from './productExcel';

/**
 * Kassa dasturining "Ҳарид" (kirim) faylini import qilish.
 *  - Mahsulot avval shtrix-kod (Коди), keyin nomi bo'yicha topiladi.
 *  - Har bir qator — omborga kirim (qoldiq oshadi), "Sotish narxi" — mahsulot narxi bo'ladi.
 *  - Do'konda yo'q mahsulot avtomatik yaratiladi, kategoriyasi taxmin qilinadi.
 *  - Bir xil qator (sana + mahsulot + miqdor) ikkinchi marta yuklansa — o'tkazib yuboriladi.
 */

const UNIT_UZ: Record<Unit, string> = { PIECE: 'dona', KG: 'kg', GRAM: 'gramm', LITER: 'litr', BOX: 'karobka', PACK: 'pachka' };
const defaultStep = (u: Unit) => (u === 'KG' || u === 'LITER' ? 0.5 : u === 'GRAM' ? 100 : 1);

type ProductLite = {
  id: number;
  nameUz: string;
  nameRu: string;
  barcode: string | null;
  categoryId: number;
  unit: Unit;
  price: number;
  oldPrice: number | null;
  stock: Prisma.Decimal;
  isActive: boolean;
};

/** Bir mahsulotga tegishli qatorlar (fayldagi tartibda) */
type Group = { key: string; code: string; name: string; rows: PurchaseRow[]; product?: ProductLite; category?: CategoryRef; sure?: boolean };

const movementNote = (r: PurchaseRow) => ['Kirim', r.supplier, r.date].filter(Boolean).join(' · ');

/** AI orqali kategoriyani aniqlash (bir so'rovda hammasi). Xato bo'lsa — null */
async function aiCategories(names: string[], categories: CategoryRef[]): Promise<Map<string, number> | null> {
  if (!geminiClient || !names.length) return null;
  const prompt = [
    'You categorize products of a sweets / chocolate / gift shop in Uzbekistan.',
    'Choose the single best category for every product name from this exact list (copy the category name exactly):',
    JSON.stringify(categories.map((c) => c.nameUz)),
    'Product names (brand names, often abbreviated, may contain weight like 100GR):',
    JSON.stringify(names),
    'Return ONLY JSON: {"items":[{"name":"<product name>","category":"<category from the list>"}]}',
  ].join('\n');
  try {
    const res = await withTimeout(
      geminiClient.models.generateContent({
        model: env.GEMINI_TEXT_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { responseMimeType: 'application/json', temperature: 0 },
      }),
      30_000,
    );
    const raw = (res.text || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    const parsed = JSON.parse(raw) as { items?: { name?: string; category?: string }[] };
    const byName = new Map(categories.map((c) => [c.nameUz.trim().toLowerCase(), c.id]));
    const out = new Map<string, number>();
    for (const it of parsed.items ?? []) {
      const id = byName.get(String(it.category ?? '').trim().toLowerCase());
      if (it.name && id) out.set(productKey(it.name), id);
    }
    return out;
  } catch (err) {
    logger.warn({ err: (err as Error)?.message }, 'AI kategoriya aniqlay olmadi');
    return null;
  }
}

export async function importPurchase(ws: ExcelJS.Worksheet, actor: Actor): Promise<ImportResult> {
  const sheet = parsePurchaseSheet(ws);
  const result: ImportResult = {
    kind: 'purchase',
    created: 0,
    updated: 0,
    unchanged: 0,
    categoriesCreated: [],
    errors: [...sheet.errors],
    rowsApplied: 0,
    rowsSkipped: 0,
    priceChanged: 0,
    newProducts: [],
  };
  if (!sheet.rows.length) throw new Error('Kirim faylida mahsulot qatorlari topilmadi');

  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      select: { id: true, nameUz: true, nameRu: true, barcode: true, categoryId: true, unit: true, price: true, oldPrice: true, stock: true, isActive: true },
      orderBy: { id: 'asc' },
    }),
    prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { id: true, nameUz: true, nameRu: true } }),
  ]);
  if (!categories.length) throw new Error("Avval kamida bitta kategoriya yarating");

  // Bir nechta mos kelsa — faolini / qoldig'i borini afzal ko'ramiz
  const better = (a: ProductLite | undefined, b: ProductLite) =>
    !a ? b : a.isActive !== b.isActive ? (a.isActive ? a : b) : toNum(a.stock) >= toNum(b.stock) ? a : b;
  const byCode = new Map<string, ProductLite>();
  const byName = new Map<string, ProductLite>();
  for (const p of products) {
    if (p.barcode) byCode.set(p.barcode, better(byCode.get(p.barcode), p));
    for (const n of [p.nameUz, p.nameRu]) {
      const k = productKey(n);
      if (k) byName.set(k, better(byName.get(k), p));
    }
  }

  // Qatorlarni mahsulot bo'yicha guruhlaymiz (kod bo'lmasa — nom bo'yicha)
  const groups = new Map<string, Group>();
  for (const r of sheet.rows) {
    const nameK = productKey(r.name);
    const key = r.code ? `c:${r.code}` : `n:${nameK}`;
    const g = groups.get(key) ?? { key, code: r.code, name: r.name, rows: [] };
    g.rows.push(r);
    groups.set(key, g);
  }

  // Mavjud mahsulotni topish; yangilari uchun kategoriya
  const guesser = new CategoryGuesser(categories, products);
  const unsure: Group[] = [];
  const newByName = new Map<string, Group>();
  for (const g of groups.values()) {
    const nameK = productKey(g.name);
    g.product = (g.code ? byCode.get(g.code) : undefined) ?? byName.get(nameK);
    if (g.product) continue;
    // Bir xil nomli, lekin turli kodli qatorlar — bitta yangi mahsulot
    const twin = newByName.get(nameK);
    if (twin) {
      twin.rows.push(...g.rows);
      g.rows = [];
      continue;
    }
    newByName.set(nameK, g);
    const guess = guesser.guess(g.name);
    if (!guess) continue;
    g.category = guess.category;
    g.sure = guess.sure;
    if (guess.sure) guesser.learn(g.name, guess.category.id);
    else unsure.push(g);
  }
  if (unsure.length) {
    const ai = await aiCategories(unsure.map((g) => g.name), categories);
    for (const g of unsure) {
      const id = ai?.get(productKey(g.name));
      const cat = id ? categories.find((c) => c.id === id) : undefined;
      if (cat) g.category = cat;
    }
  }

  const translateIds: number[] = [];
  for (const g of groups.values()) {
    if (!g.rows.length) continue;
    const first = g.rows[0];
    try {
      const sell = [...g.rows].reverse().find((r) => r.sell != null && r.sell > 0)?.sell ?? null;
      const unit = g.rows.find((r) => r.unit)?.unit ?? undefined;
      if (g.rows.some((r) => r.unit === null)) throw new Error(`${g.name}: o'lchov birligi tanilmadi ("${g.rows.find((r) => r.unit === null)!.unitRaw}")`);
      if (sell != null && sell > 1_000_000_000) throw new Error(`${g.name}: sotish narxi noto'g'ri`);

      let p = g.product;
      if (p && unit && unit !== p.unit) {
        throw new Error(`${g.name}: faylda "${UNIT_UZ[unit]}", do'konda "${UNIT_UZ[p.unit]}" — birlik mos emas, qoldiq qo'shilmadi`);
      }

      // Avval yuklangan qatorlarni aniqlaymiz (sana + miqdor + mahsulot)
      let fresh = g.rows;
      if (p) {
        const prev = await prisma.stockMovement.findMany({
          where: { productId: p.id, type: 'IN', note: { startsWith: 'Kirim' } },
          select: { qty: true, note: true },
        });
        const seen = new Map<string, number>();
        for (const m of prev) {
          const k = `${round3(toNum(m.qty))}|${m.note}`;
          seen.set(k, (seen.get(k) ?? 0) + 1);
        }
        fresh = g.rows.filter((r) => {
          if (!r.date) return true;
          const k = `${r.qty}|${movementNote(r)}`;
          const n = seen.get(k) ?? 0;
          if (n > 0) {
            seen.set(k, n - 1);
            return false;
          }
          return true;
        });
        result.rowsSkipped! += g.rows.length - fresh.length;
        if (!fresh.length) {
          result.unchanged++;
          continue;
        }
      }

      if (!p) {
        if (sell == null) throw new Error(`${g.name}: sotish narxi yo'q — yangi mahsulot qo'shilmadi`);
        if (!g.category) throw new Error(`${g.name}: kategoriya aniqlanmadi`);
        const u: Unit = unit ?? 'PIECE';
        const step = defaultStep(u);
        const created = await prisma.product.create({
          data: {
            nameUz: g.name.slice(0, 200),
            nameRu: g.name.slice(0, 200),
            categoryId: g.category.id,
            barcode: g.code || null,
            price: Math.round(sell),
            unit: u,
            step: round3(step),
            minQty: round3(step),
            stock: 0,
            isActive: true,
            createdById: actor.userId,
            updatedById: actor.userId,
          },
          select: { id: true, nameUz: true, nameRu: true, barcode: true, categoryId: true, unit: true, price: true, oldPrice: true, stock: true, isActive: true },
        });
        p = created;
        translateIds.push(created.id);
        result.created++;
        result.newProducts!.push({ name: created.nameUz, category: g.category.nameUz });
        await audit(actor, 'product.create', 'Product', created.id, null, { nameUz: created.nameUz, price: created.price, source: 'kirim' });
      } else {
        // Narx, shtrix-kod, faollik
        const data: Prisma.ProductUncheckedUpdateInput = {};
        if (sell != null && Math.round(sell) !== p.price) {
          data.price = Math.round(sell);
          if (p.oldPrice != null && p.oldPrice <= Math.round(sell)) data.oldPrice = null;
          result.priceChanged!++;
        }
        if (g.code && !p.barcode && !byCode.has(g.code)) data.barcode = g.code;
        // Tugab qolgani uchun yashirilgan mahsulot qayta keldi — ko'rsatamiz
        if (!p.isActive && toNum(p.stock) <= 0) data.isActive = true;
        if (Object.keys(data).length) {
          await prisma.product.update({ where: { id: p.id }, data: { ...data, updatedById: actor.userId } });
          await audit(actor, 'product.update', 'Product', p.id, { price: p.price, isActive: p.isActive }, { ...data, source: 'kirim' });
        }
        result.updated++;
      }
      if (g.code) byCode.set(g.code, p);

      // Har bir qator — alohida kirim harakati
      const productId = p.id;
      await prisma.$transaction(async (tx) => {
        for (const r of fresh) {
          const upd = await tx.product.update({ where: { id: productId }, data: { stock: { increment: round3(r.qty) } }, select: { stock: true } });
          await tx.stockMovement.create({
            data: { productId, type: 'IN', qty: round3(r.qty), stockAfter: upd.stock, note: movementNote(r), userId: actor.userId, actorLabel: actor.label },
          });
        }
      });
      result.rowsApplied! += fresh.length;
    } catch (e) {
      result.errors.push({ row: first.row, message: (e as Error).message || 'Xato' });
    }
  }

  for (const id of translateIds) enqueueTranslation('product', id);
  result.errors.sort((a, b) => a.row - b.row);
  await audit(actor, 'product.import', 'Product', null, null, {
    kind: 'purchase',
    created: result.created,
    updated: result.updated,
    rowsApplied: result.rowsApplied,
    rowsSkipped: result.rowsSkipped,
    errors: result.errors.length,
  });
  return result;
}
