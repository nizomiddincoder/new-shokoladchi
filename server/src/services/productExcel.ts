import ExcelJS from 'exceljs';
import type { Prisma, Unit } from '@prisma/client';
import { prisma } from '../db';
import { round3, toNum } from '../lib/format';
import { audit } from '../lib/audit';
import type { Actor } from '../lib/auth';
import { guessCategoryIcon } from '../lib/categoryIcon';
import { enqueueCategoryImage } from './ai';
import { enqueueTranslation } from './translate';

/**
 * Mahsulotlarni Excel orqali eksport/import qilish.
 * Eksport qilingan fayl import shabloni ham bo'ladi: uni tahrirlab qayta yuklash mumkin.
 *  - ID bor qator  -> shu mahsulot yangilanadi (bo'sh katakchalar o'zgarmaydi)
 *  - ID bo'sh qator -> yangi mahsulot qo'shiladi
 */

type ColKey =
  | 'id'
  | 'nameUz'
  | 'nameRu'
  | 'descriptionUz'
  | 'descriptionRu'
  | 'category'
  | 'price'
  | 'oldPrice'
  | 'unit'
  | 'step'
  | 'minQty'
  | 'stock'
  | 'lowStockThreshold'
  | 'isActive';

const COLUMNS: { key: ColKey; header: string; width: number; aliases: string[] }[] = [
  { key: 'id', header: 'ID', width: 8, aliases: ['id'] },
  { key: 'nameUz', header: 'Nomi (uz) *', width: 32, aliases: ['nomi', 'nomi uz', 'nomi (uz)', 'name', 'название uz'] },
  { key: 'nameRu', header: 'Nomi (ru)', width: 32, aliases: ['nomi ru', 'nomi (ru)', 'название', 'название ru', 'name ru'] },
  { key: 'descriptionUz', header: 'Tavsif (uz)', width: 40, aliases: ['tavsif', 'tavsif uz', 'tavsif (uz)', 'description'] },
  { key: 'descriptionRu', header: 'Tavsif (ru)', width: 40, aliases: ['tavsif ru', 'tavsif (ru)', 'описание'] },
  { key: 'category', header: 'Kategoriya *', width: 22, aliases: ['kategoriya', 'category', 'категория'] },
  { key: 'price', header: "Narx (so'm) *", width: 14, aliases: ['narx', "narx (so'm)", 'narx som', 'price', 'цена'] },
  { key: 'oldPrice', header: 'Eski narx', width: 12, aliases: ['eski narx', 'old price', 'старая цена'] },
  { key: 'unit', header: 'Birlik', width: 10, aliases: ['birlik', 'unit', 'единица'] },
  { key: 'step', header: 'Qadam', width: 9, aliases: ['qadam', 'step', 'шаг'] },
  { key: 'minQty', header: 'Min. miqdor', width: 11, aliases: ['min miqdor', 'min. miqdor', 'minimal miqdor', 'min qty', 'мин'] },
  { key: 'stock', header: 'Qoldiq', width: 10, aliases: ['qoldiq', 'stock', 'остаток'] },
  { key: 'lowStockThreshold', header: 'Kam qolgan chegarasi', width: 12, aliases: ['kam qolgan chegarasi', 'chegara', 'threshold', 'порог'] },
  { key: 'isActive', header: 'Faol', width: 8, aliases: ['faol', 'holat', 'active', 'активен'] },
];

const UNIT_LABEL: Record<Unit, string> = { PIECE: 'dona', KG: 'kg', GRAM: 'gramm', LITER: 'litr', BOX: 'karobka', PACK: 'pachka' };
const UNIT_ALIASES: Record<string, Unit> = {
  piece: 'PIECE', dona: 'PIECE', ta: 'PIECE', шт: 'PIECE', штука: 'PIECE', pcs: 'PIECE',
  kg: 'KG', kilogramm: 'KG', kilogram: 'KG', кг: 'KG',
  gram: 'GRAM', gramm: 'GRAM', g: 'GRAM', gr: 'GRAM', г: 'GRAM', грамм: 'GRAM',
  liter: 'LITER', litr: 'LITER', l: 'LITER', л: 'LITER', литр: 'LITER',
  box: 'BOX', karobka: 'BOX', quti: 'BOX', коробка: 'BOX',
  pack: 'PACK', pachka: 'PACK', упаковка: 'PACK', пачка: 'PACK',
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’ʻʼ`]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/\*/g, '')
    .trim();

// ======================= EKSPORT =======================

export async function buildProductsWorkbook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Shokoladchi';
  wb.created = new Date();
  const ws = wb.addWorksheet('Mahsulotlar');
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));

  const products = await prisma.product.findMany({ include: { category: true }, orderBy: [{ categoryId: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }] });
  for (const p of products) {
    ws.addRow({
      id: p.id,
      nameUz: p.nameUz,
      nameRu: p.nameRu,
      descriptionUz: p.descriptionUz,
      descriptionRu: p.descriptionRu,
      category: p.category.nameUz,
      price: p.price,
      oldPrice: p.oldPrice ?? null,
      unit: UNIT_LABEL[p.unit],
      step: toNum(p.step),
      minQty: toNum(p.minQty),
      stock: toNum(p.stock),
      lowStockThreshold: toNum(p.lowStockThreshold),
      isActive: p.isActive ? 'Ha' : "Yo'q",
    });
  }

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6F4E37' } };
  header.alignment = { vertical: 'middle', wrapText: true };
  header.height = 30;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.getColumn('price').numFmt = '#,##0';
  ws.getColumn('oldPrice').numFmt = '#,##0';
  ws.getColumn('id').font = { color: { argb: 'FF888888' } };

  // Ro'yxatdan tanlash (Birlik, Faol, Kategoriya) — 1000 qatorgacha
  const cats = await prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { nameUz: true } });
  const lists = wb.addWorksheet('Royxat', { state: 'hidden' });
  cats.forEach((c, i) => (lists.getCell(i + 1, 1).value = c.nameUz));
  const colLetter = (key: ColKey) => ws.getColumn(key).letter;
  for (let r = 2; r <= Math.max(products.length + 200, 1000); r++) {
    ws.getCell(`${colLetter('unit')}${r}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`"${Object.values(UNIT_LABEL).join(',')}"`],
    };
    ws.getCell(`${colLetter('isActive')}${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Ha,Yo\'q"'] };
    if (cats.length) {
      // Yangi kategoriya nomini yozish ham mumkin (ogohlantirish emas, faqat taklif)
      ws.getCell(`${colLetter('category')}${r}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        showErrorMessage: false,
        formulae: [`Royxat!$A$1:$A$${cats.length}`],
      };
    }
  }

  // Yo'riqnoma
  const help = wb.addWorksheet("Yo'riqnoma");
  help.getColumn(1).width = 110;
  [
    'MAHSULOTLARNI EXCEL ORQALI QO\'SHISH VA TAHRIRLASH',
    '',
    '1. "Mahsulotlar" varag\'ida har bir qator — bitta mahsulot.',
    '2. Yangi mahsulot qo\'shish: ID ustunini BO\'SH qoldiring va qolgan maydonlarni to\'ldiring.',
    '3. Mavjud mahsulotni tahrirlash: ID ni o\'zgartirmang, kerakli katakchalarni o\'zgartiring. Bo\'sh katakcha — o\'zgarmaydi.',
    '4. Majburiy maydonlar (*): Nomi (uz), Kategoriya, Narx.',
    '5. Kategoriya nomi mavjud kategoriyaga mos kelmasa — yangi kategoriya avtomatik yaratiladi.',
    '6. Nomi (ru) va Tavsif (ru) bo\'sh bo\'lsa — AI avtomatik tarjima qiladi.',
    '7. Birlik: dona, kg, gramm, litr, karobka, pachka. Bo\'sh bo\'lsa — dona.',
    '8. Qadam / Min. miqdor: masalan kg uchun 0.5, dona uchun 1. Bo\'sh bo\'lsa birlikka qarab avtomatik.',
    '9. Qoldiq: yangi mahsulot uchun boshlang\'ich qoldiq; mavjud mahsulotda o\'zgartirilsa — ombor harakati (tuzatish) yoziladi.',
    '10. Eski narx: joriy narxdan katta bo\'lsa chegirma sifatida ko\'rsatiladi.',
    '11. Faol: Ha — mijozlarga ko\'rinadi, Yo\'q — yashirin.',
    '12. Rasmlarni import qilib bo\'lmaydi — ularni mahsulot sahifasida qo\'shing.',
  ].forEach((line, i) => {
    const cell = help.getCell(i + 1, 1);
    cell.value = line;
    if (i === 0) cell.font = { bold: true, size: 14, color: { argb: 'FF6F4E37' } };
  });

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const stamp = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());
  return { buffer, filename: `mahsulotlar-${stamp}.xlsx`, count: products.length };
}

// ======================= IMPORT =======================

export type ImportResult = {
  created: number;
  updated: number;
  unchanged: number;
  categoriesCreated: string[];
  errors: { row: number; message: string }[];
};

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((r) => r.text).join('').trim();
    if ('text' in v && typeof v.text === 'string') return v.text.trim();
    if ('result' in v) return cellText(v.result as ExcelJS.CellValue);
  }
  return String(v).trim();
}

function parseNum(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\s| |so'm|сум|sum/gi, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

function parseBool(raw: string): boolean | null {
  const s = norm(raw);
  if (!s) return null;
  if (['ha', 'xa', 'yes', 'true', '1', 'да', 'faol', 'active', '+'].includes(s)) return true;
  if (["yo'q", 'yoq', 'no', 'false', '0', 'нет', 'nofaol', 'inactive', '-'].includes(s)) return false;
  return null;
}

function parseUnit(raw: string): Unit | null | undefined {
  const s = norm(raw).replace(/\.$/, '');
  if (!s) return undefined;
  if ((['PIECE', 'KG', 'GRAM', 'LITER', 'BOX', 'PACK'] as string[]).includes(s.toUpperCase())) return s.toUpperCase() as Unit;
  return UNIT_ALIASES[s] ?? null;
}

const defaultStep = (u: Unit) => (u === 'KG' || u === 'LITER' ? 0.5 : u === 'GRAM' ? 100 : 1);

export async function importProducts(buffer: Buffer, actor: Actor): Promise<ImportResult> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new Error("Faylni o'qib bo'lmadi. Faqat .xlsx formatidagi Excel fayl yuklang");
  }
  const ws = wb.getWorksheet('Mahsulotlar') ?? wb.worksheets.find((w) => w.state !== 'hidden');
  if (!ws) throw new Error('Excel faylda varaq topilmadi');

  // Sarlavhalar bo'yicha ustunlarni topamiz (tartibi muhim emas)
  const colOf: Partial<Record<ColKey, number>> = {};
  ws.getRow(1).eachCell((cell, col) => {
    const h = norm(cellText(cell.value));
    const found = COLUMNS.find((c) => norm(c.header) === h || c.aliases.includes(h));
    if (found && colOf[found.key] == null) colOf[found.key] = col;
  });
  if (colOf.nameUz == null || colOf.price == null || colOf.category == null) {
    throw new Error('Sarlavhalar topilmadi. Avval "Excel yuklab olish" orqali shablonni oling va shu formatda to\'ldiring');
  }

  const result: ImportResult = { created: 0, updated: 0, unchanged: 0, categoriesCreated: [], errors: [] };
  const categories = await prisma.category.findMany();
  const catByName = new Map<string, number>();
  for (const c of categories) {
    catByName.set(norm(c.nameUz), c.id);
    catByName.set(norm(c.nameRu), c.id);
  }
  const translateIds: number[] = [];

  const findCategory = async (name: string): Promise<number> => {
    const key = norm(name);
    const existing = catByName.get(key);
    if (existing) return existing;
    const c = await prisma.category.create({ data: { nameUz: name.trim(), nameRu: name.trim(), iconName: guessCategoryIcon(name) } });
    enqueueTranslation('category', c.id);
    await enqueueCategoryImage(c.id);
    catByName.set(key, c.id);
    result.categoriesCreated.push(c.nameUz);
    await audit(actor, 'category.create', 'Category', c.id, null, { nameUz: c.nameUz, source: 'excel' });
    return c.id;
  };

  const lastRow = ws.actualRowCount > 0 ? ws.lastRow?.number ?? 1 : 1;
  if (lastRow - 1 > 5000) throw new Error('Bir martada ko\'pi bilan 5000 ta qator yuklash mumkin');

  for (let r = 2; r <= lastRow; r++) {
    const row = ws.getRow(r);
    const get = (k: ColKey) => (colOf[k] == null ? '' : cellText(row.getCell(colOf[k]!).value));
    const values = COLUMNS.map((c) => get(c.key));
    if (values.every((v) => !v)) continue; // bo'sh qator

    try {
      const idRaw = get('id');
      const id = idRaw ? Number(idRaw) : null;
      if (idRaw && (!Number.isInteger(id) || id! <= 0)) throw new Error('ID noto\'g\'ri');
      const before = id ? await prisma.product.findUnique({ where: { id } }) : null;
      if (id && !before) throw new Error(`ID ${id} li mahsulot topilmadi (yangi qo'shish uchun ID ni bo'sh qoldiring)`);

      const nameUz = get('nameUz').slice(0, 200);
      const nameRu = get('nameRu').slice(0, 200);
      const descriptionUz = get('descriptionUz').slice(0, 3000);
      const descriptionRu = get('descriptionRu').slice(0, 3000);
      const categoryName = get('category');
      const price = parseNum(get('price'));
      const oldPrice = parseNum(get('oldPrice'));
      const unit = parseUnit(get('unit'));
      const step = parseNum(get('step'));
      const minQty = parseNum(get('minQty'));
      const stock = parseNum(get('stock'));
      const low = parseNum(get('lowStockThreshold'));
      const isActive = parseBool(get('isActive'));

      if (!before) {
        if (!nameUz) throw new Error('Nomi (uz) majburiy');
        if (!categoryName) throw new Error('Kategoriya majburiy');
        if (price == null) throw new Error('Narx majburiy');
      }
      if (price != null && (Number.isNaN(price) || price < 0 || price > 1_000_000_000)) throw new Error('Narx noto\'g\'ri');
      if (oldPrice != null && (Number.isNaN(oldPrice) || oldPrice < 0)) throw new Error('Eski narx noto\'g\'ri');
      if (unit === null) throw new Error(`Birlik noto'g'ri: "${get('unit')}" (dona, kg, gramm, litr, karobka, pachka)`);
      for (const [label, v] of [['Qadam', step], ['Min. miqdor', minQty]] as const) {
        if (v != null && (Number.isNaN(v) || v <= 0 || v > 100000)) throw new Error(`${label} noto'g'ri`);
      }
      if (stock != null && (Number.isNaN(stock) || stock < 0 || stock > 10_000_000)) throw new Error('Qoldiq noto\'g\'ri');
      if (low != null && (Number.isNaN(low) || low < 0)) throw new Error('Kam qolgan chegarasi noto\'g\'ri');
      if (get('isActive') && isActive === null) throw new Error('Faol ustuniga "Ha" yoki "Yo\'q" yozing');

      const categoryId = categoryName ? await findCategory(categoryName) : undefined;
      const finalPrice = price != null ? Math.round(price) : before!.price;
      const finalUnit: Unit = unit ?? before?.unit ?? 'PIECE';
      const finalStep = step ?? (before ? toNum(before.step) : defaultStep(finalUnit));
      // Eski narx faqat joriy narxdan katta bo'lsa ma'noli
      const finalOld = oldPrice != null ? (oldPrice > finalPrice ? Math.round(oldPrice) : null) : before ? before.oldPrice : null;

      if (!before) {
        const needTranslate = !nameRu;
        const p = await prisma.$transaction(async (tx) => {
          const created = await tx.product.create({
            data: {
              nameUz,
              nameRu: nameRu || nameUz,
              descriptionUz,
              descriptionRu: descriptionRu || descriptionUz,
              categoryId: categoryId!,
              price: finalPrice,
              oldPrice: finalOld,
              unit: finalUnit,
              step: round3(finalStep),
              minQty: round3(minQty ?? finalStep),
              lowStockThreshold: round3(low ?? 0),
              stock: round3(stock ?? 0),
              isActive: isActive ?? true,
              createdById: actor.userId,
              updatedById: actor.userId,
            },
          });
          if (stock && stock > 0) {
            await tx.stockMovement.create({
              data: { productId: created.id, type: 'IN', qty: round3(stock), stockAfter: round3(stock), note: 'Excel import', userId: actor.userId, actorLabel: actor.label },
            });
          }
          return created;
        });
        if (needTranslate) translateIds.push(p.id);
        result.created++;
        continue;
      }

      // Yangilash: faqat to'ldirilgan katakchalar
      const data: Prisma.ProductUncheckedUpdateInput = {};
      if (nameUz && nameUz !== before.nameUz) data.nameUz = nameUz;
      if (nameRu && nameRu !== before.nameRu) data.nameRu = nameRu;
      if (descriptionUz && descriptionUz !== before.descriptionUz) data.descriptionUz = descriptionUz;
      if (descriptionRu && descriptionRu !== before.descriptionRu) data.descriptionRu = descriptionRu;
      if (categoryId && categoryId !== before.categoryId) data.categoryId = categoryId;
      if (finalPrice !== before.price) data.price = finalPrice;
      if ((finalOld ?? null) !== (before.oldPrice ?? null)) data.oldPrice = finalOld;
      if (unit && unit !== before.unit) data.unit = unit;
      if (step != null && round3(step) !== toNum(before.step)) data.step = round3(step);
      if (minQty != null && round3(minQty) !== toNum(before.minQty)) data.minQty = round3(minQty);
      if (low != null && round3(low) !== toNum(before.lowStockThreshold)) data.lowStockThreshold = round3(low);
      if (isActive != null && isActive !== before.isActive) data.isActive = isActive;
      const stockDelta = stock != null ? round3(stock - toNum(before.stock)) : 0;

      if (!Object.keys(data).length && !stockDelta) {
        result.unchanged++;
        continue;
      }
      await prisma.$transaction(async (tx) => {
        await tx.product.update({ where: { id: before.id }, data: { ...data, updatedById: actor.userId } });
        if (stockDelta) {
          const p = await tx.product.update({ where: { id: before.id }, data: { stock: { increment: stockDelta } }, select: { stock: true } });
          await tx.stockMovement.create({
            data: { productId: before.id, type: 'ADJUST', qty: stockDelta, stockAfter: p.stock, note: 'Excel import', userId: actor.userId, actorLabel: actor.label },
          });
        }
      });
      // O'zbekcha nom o'zgarib, ruschasi berilmagan bo'lsa — qayta tarjima
      if ((data.nameUz || data.descriptionUz) && !nameRu) translateIds.push(before.id);
      await audit(actor, 'product.update', 'Product', before.id, null, { ...data, ...(stockDelta ? { stockDelta } : {}), source: 'excel' });
      result.updated++;
    } catch (e) {
      result.errors.push({ row: r, message: (e as Error).message || 'Xato' });
    }
  }

  for (const id of translateIds) enqueueTranslation('product', id);
  await audit(actor, 'product.import', 'Product', null, null, {
    created: result.created,
    updated: result.updated,
    errors: result.errors.length,
  });
  return result;
}
