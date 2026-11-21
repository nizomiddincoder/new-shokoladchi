import type ExcelJS from 'exceljs';
import type { Unit } from '@prisma/client';

/**
 * Kassa/ombor dasturidan olingan "Ҳарид" (kirim) Excel faylini o'qish.
 * Ma'lumotlar bazasiga bog'liq emas — faqat faylni tahlil qiladi va
 * mahsulot nomlarini solishtirish / kategoriyani taxmin qilish uchun yordamchilar beradi.
 *
 * Kutiladigan ustunlar (tartibi va aniq yozilishi muhim emas, kirill yoki lotin):
 *   Коди | Маҳсулот номи | Ҳарид сони | Ўлчов бирлиги | Таннарҳ | Сотиш нарҳи | Етказувчи | Сана
 */

// ---------------------------------------------------------------- matn

const CYR: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', ғ: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', қ: 'q',
  л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ў: 'o', ф: 'f', х: 'x', ҳ: 'x', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** Sarlavhani solishtirish uchun: kirill -> lotin, kichik harf, h -> x, belgilarsiz */
export function headerKey(s: string): string {
  return s
    .toLowerCase()
    .split('')
    .map((ch) => CYR[ch] ?? ch)
    .join('')
    .replace(/[‘’ʻʼ`']/g, '')
    .replace(/(?<![csz])h/g, 'x') // "narhi" = "narxi", lekin "sh"/"ch" o'zgarmaydi
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim();
}

/**
 * Mahsulot nomini solishtirish kaliti: katta harf, bo'sh joy va tinish belgilarsiz,
 * "220 GR" = "220GR" = "220 G" kabi.
 */
export function productKey(name: string): string {
  return String(name || '')
    .toUpperCase()
    .replace(/[‘’ʻʼ`']/g, '')
    .replace(/(\d)\s*(GR|G|GRAM|ГР|Г)(?![A-ZА-Я])/g, '$1GR')
    .replace(/(\d)\s*(ML|МЛ)(?![A-ZА-Я])/g, '$1ML')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/[^A-Z0-9А-ЯЁЎҚҒҲ/.%]+/g, '');
}

/** Nomni chiroyli ko'rinishga keltirish: ortiqcha bo'sh joylar olib tashlanadi */
export const cleanName = (s: string) => s.replace(/\s+/g, ' ').trim();

export function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(v.getUTCDate())}.${p(v.getUTCMonth() + 1)}.${v.getUTCFullYear()} ${p(v.getUTCHours())}:${p(v.getUTCMinutes())}:${p(v.getUTCSeconds())}`;
  }
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((r) => r.text).join('').trim();
    if ('text' in v && typeof v.text === 'string') return v.text.trim();
    if ('result' in v) return cellText(v.result as ExcelJS.CellValue);
  }
  return String(v).trim();
}

export function parseAmount(raw: string): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(/[\s ]|so'm|сўм|сум|sum/gi, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const UNIT_ALIASES: Record<string, Unit> = {
  piece: 'PIECE', dona: 'PIECE', ta: 'PIECE', шт: 'PIECE', штука: 'PIECE', pcs: 'PIECE', дона: 'PIECE', та: 'PIECE',
  kg: 'KG', kilogramm: 'KG', kilogram: 'KG', кг: 'KG', килограмм: 'KG',
  gram: 'GRAM', gramm: 'GRAM', g: 'GRAM', gr: 'GRAM', г: 'GRAM', гр: 'GRAM', грамм: 'GRAM',
  liter: 'LITER', litr: 'LITER', l: 'LITER', л: 'LITER', литр: 'LITER',
  box: 'BOX', karobka: 'BOX', korobka: 'BOX', quti: 'BOX', коробка: 'BOX', қути: 'BOX',
  pack: 'PACK', pachka: 'PACK', упаковка: 'PACK', пачка: 'PACK',
};

/** undefined — bo'sh, null — tanilmadi */
export function parseUnit(raw: string): Unit | null | undefined {
  const s = raw.toLowerCase().replace(/\.$/, '').trim();
  if (!s) return undefined;
  if (['PIECE', 'KG', 'GRAM', 'LITER', 'BOX', 'PACK'].includes(s.toUpperCase())) return s.toUpperCase() as Unit;
  return UNIT_ALIASES[s] ?? null;
}

// ---------------------------------------------------------------- fayl

type PCol = 'code' | 'name' | 'qty' | 'unit' | 'cost' | 'sell' | 'supplier' | 'date';

export type PurchaseRow = {
  row: number;
  code: string;
  name: string;
  qty: number;
  unit: Unit | null | undefined;
  unitRaw: string;
  cost: number | null;
  sell: number | null;
  supplier: string;
  date: string;
};

export type PurchaseSheet = { rows: PurchaseRow[]; errors: { row: number; message: string }[] };

/** Sarlavha qatorlari: boshidagi (5 tagacha) faqat matnli qatorlar */
function headerRows(ws: ExcelJS.Worksheet): number[] {
  const rows: number[] = [];
  for (let r = 1; r <= Math.min(5, ws.rowCount); r++) {
    const cells: string[] = [];
    ws.getRow(r).eachCell((c) => {
      const t = cellText(c.value);
      if (t) cells.push(t);
    });
    if (!cells.length) {
      if (rows.length) break;
      continue;
    }
    if (cells.some((t) => /^-?\d+([.,]\d+)?$/.test(t))) break;
    rows.push(r);
  }
  return rows;
}

function detectColumns(ws: ExcelJS.Worksheet, hdr: number[]) {
  const colOf: Partial<Record<PCol, number>> = {};
  const lastCol = Math.min(ws.columnCount || 0, 60);
  for (let c = 1; c <= lastCol; c++) {
    const parts = hdr.map((r) => headerKey(cellText(ws.getRow(r).getCell(c).value))).filter(Boolean);
    if (!parts.length) continue;
    const all = parts.join(' ');
    const last = parts[parts.length - 1];
    // "Сумма" guruhidagi ustunlar (jami summa) kerak emas
    if (/\bsumma\b|\bitogo\b|\bjami\b/.test(all)) continue;
    const set = (k: PCol, ok: boolean) => {
      if (ok && colOf[k] == null) colOf[k] = c;
    };
    set('name', /maxsulot nomi|tovar nomi|naimenovanie|nazvanie|^nomi$|\bnomi\b/.test(all));
    set('qty', /xarid soni|kirim soni|\bsoni\b|miqdori?\b|kolichestvo|kol vo/.test(all));
    set('unit', /olchov|birlik|birligi|edinitsa|ed izm/.test(all));
    set('sell', /sotish narxi?|sotuv narxi?|tsena prodaj|prodajnaya|chakana/.test(last));
    set('cost', /tannarx|sebestoimost|kirim narxi?|zakup/.test(last));
    set('code', /\bkodi?\b|shtrix|barkod|barcode|artikul/.test(all));
    set('supplier', /etkazuvchi|taminotchi|postavshik|supplier/.test(all));
    set('date', /\bsana\b|\bdata\b|date/.test(all));
  }
  return colOf;
}

/** Fayl kassa dasturining "Ҳарид" (kirim) hisobotimi? */
export function isPurchaseSheet(ws: ExcelJS.Worksheet): boolean {
  const colOf = detectColumns(ws, headerRows(ws));
  return colOf.name != null && colOf.qty != null && colOf.sell != null;
}

export function parsePurchaseSheet(ws: ExcelJS.Worksheet): PurchaseSheet {
  const hdr = headerRows(ws);
  const colOf = detectColumns(ws, hdr);
  if (colOf.name == null || colOf.qty == null || colOf.sell == null) {
    throw new Error('Kirim faylida "Маҳсулот номи", "Ҳарид сони" va "Сотиш нарҳи" ustunlari topilmadi');
  }
  const out: PurchaseSheet = { rows: [], errors: [] };
  const start = (hdr[hdr.length - 1] ?? 0) + 1;
  const lastRow = ws.lastRow?.number ?? 0;
  if (lastRow - start > 5000) throw new Error("Bir martada ko'pi bilan 5000 ta qator yuklash mumkin");

  for (let r = start; r <= lastRow; r++) {
    const row = ws.getRow(r);
    const get = (k: PCol) => (colOf[k] == null ? '' : cellText(row.getCell(colOf[k]!).value));
    const name = cleanName(get('name'));
    const qtyRaw = get('qty');
    if (!name && !qtyRaw) continue; // bo'sh yoki "Jami" qatori
    if (!name) continue;
    if (/^(jami|итого|всего|жами)\b/i.test(name)) continue;
    const qty = parseAmount(qtyRaw);
    const sell = parseAmount(get('sell'));
    if (qty == null || qty <= 0) {
      out.errors.push({ row: r, message: `${name}: Ҳарид сони noto'g'ri ("${qtyRaw}")` });
      continue;
    }
    const supplier = cleanName(get('supplier'));
    out.rows.push({
      row: r,
      code: get('code').replace(/\s+/g, ''),
      name,
      qty: Math.round(qty * 1000) / 1000,
      unit: parseUnit(get('unit')),
      unitRaw: get('unit'),
      cost: parseAmount(get('cost')),
      sell,
      supplier: /^\[.*\]$|номаълум|noma.?lum/i.test(supplier) ? '' : supplier,
      date: get('date'),
    });
  }
  return out;
}

// ---------------------------------------------------------------- kategoriya

/** Nomdagi kalit so'zlar bo'yicha kategoriya (kategoriya nomi bo'yicha qidiriladi) */
const CATEGORY_RULES: { re: RegExp; cat: RegExp }[] = [
  { re: /\d+([.,]\d+)?\s*(L|ML|LITR)\b|\b(COLA|PEPSI|FANTA|SPRITE|SUV|SOK|JUICE|NAPITOK|LIMONAD|ENERGY|NESQUIK|LACTEL)\b/, cat: /ichimlik|напит/i },
  { re: /\b(CHOY|TEA|COFFEE?|KOFE|QAHVA|QAXVA|KAKAO|CAPPUCCINO|LATTE)\b|TEA\b|COFFEE?\b/, cat: /choy|qahva|чай|кофе/i },
  { re: /\b(MARMELAD\w*|JELE|JELLY|FRUITELLA|ZEFIR|MARSHMALLOW|PASTILA|HARIBO|BEBETO)\b/, cat: /marmelad|jele|мармелад/i },
  { re: /\b(PECHENYE|PECHENE|PECHENIYE|KEKS|VAFLI|VAFER|WAFER|WAFFLE\w*|TORT|COOKIE\w*|BISKVIT|KRUASSAN|DANSK|RULET|PIROJNIY)\b/, cat: /pechen|vafli|tort|печен/i },
  { re: /\b(MINDAL|FUNDUK|KURAGA|YONG.?OQ|PISTA|KESHYU|MAYIZ|XURMO|FINIK|ORESHKI|ARAXIS|GREK)\b/, cat: /yong|quruq|орех|сухофрук/i },
  { re: /\b(CHIPS|SNEK|SNACK|QURUT|KRAKER|CRACKER|POPCORN|SUXARIK|KIRIESHKI|LAYS|PRINGLES)\b/, cat: /chips|snek|чипс|снек/i },
  { re: /\bKINDER\b/, cat: /kinder|киндер/i },
  { re: /\b(SAVAT|KOROBOK|KOROBKA|KAROBKA|SUMKA|PODAROCHN\w*|SANDIQ|LENTA\w*|OTKRITKA|BANTIK|PAKET|FLOWER|GUL|STAKAN|KITOB)\b/, cat: /sovg.?a sav|savat|quti|корзин|подар/i },
  { re: /\b(OYINCHOQ|O.?YINCHOQ|IGRUSHKA|AYIQ|TOY)\b/, cat: /o.?yinchoq|игрушк/i },
  { re: /\b(KONFET\w*|DRAJE|DRAGEE|LEDENEC|SAQICH|ORBIT|MENTOS|CHUPA|KARAMEL\w*|IRIS|LOLLIPOP|TIC.?TAC)\b/, cat: /konfet|конфет/i },
  { re: /\b(SHOKOLAD\w*|CHOCOLATE|CHOCO|PLITKA|BATONCHIK|BAR)\b/, cat: /shokolad|шоколад/i },
];

const STOP = new Set(['GR', 'KG', 'ML', 'L', 'SM', 'DONA', 'KICHIK', 'KOTTA', 'URTACHA', 'MINI', 'NEW', 'YANGI']);
const tokens = (name: string) =>
  String(name || '')
    .toUpperCase()
    .replace(/[‘’ʻʼ`']/g, '')
    .split(/[^A-Z0-9А-ЯЁЎҚҒҲ]+/)
    .filter((t) => t.length >= 2 && !/^\d/.test(t) && !STOP.has(t));

export type CategoryRef = { id: number; nameUz: string; nameRu?: string };

/**
 * Yangi mahsulot uchun kategoriyani taxmin qiladi:
 *  1) brend (birinchi so'z) — do'kondagi shu brend mahsulotlarining ko'pchiligi qaysi kategoriyada bo'lsa;
 *  2) kalit so'zlar qoidalari (choy, marmelad, savat, ...);
 *  3) umumiy so'zlar bo'yicha eng o'xshash mahsulotlar kategoriyasi (ishonchsiz, sure=false);
 *  4) hech narsa topilmasa — "Boshqa shirinliklar" (sure=false).
 * sure=false bo'lganlarni AI (bo'lsa) qayta tekshiradi.
 */
export class CategoryGuesser {
  private brand = new Map<string, Map<number, number>>();
  private tok = new Map<string, Map<number, number>>();
  private total = 0;

  constructor(private categories: CategoryRef[], products: { nameUz: string; categoryId: number }[]) {
    for (const p of products) this.learn(p.nameUz, p.categoryId);
  }

  learn(name: string, categoryId: number) {
    const ts = tokens(name);
    if (!ts.length) return;
    this.total++;
    const bump = (m: Map<string, Map<number, number>>, k: string) => {
      const inner = m.get(k) ?? new Map<number, number>();
      inner.set(categoryId, (inner.get(categoryId) ?? 0) + 1);
      m.set(k, inner);
    };
    bump(this.brand, ts[0]);
    for (const t of new Set(ts)) bump(this.tok, t);
  }

  private findCat(re: RegExp) {
    return this.categories.find((c) => re.test(c.nameUz) || (c.nameRu ? re.test(c.nameRu) : false));
  }

  fallback(): CategoryRef | undefined {
    return this.findCat(/boshqa|прочее|другое/i) ?? this.categories[0];
  }

  guess(name: string): { category: CategoryRef; sure: boolean } | null {
    const ts = tokens(name);
    const upper = String(name || '').toUpperCase();
    const byId = (id: number) => this.categories.find((c) => c.id === id);

    // 1) brend (kamida 2 ta mahsulotda uchragan bo'lsa)
    if (ts.length) {
      const counts = this.brand.get(ts[0]);
      if (counts) {
        const sum = [...counts.values()].reduce((a, b) => a + b, 0);
        const [bestId, best] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
        const cat = byId(bestId);
        if (cat && best >= 2 && best / sum >= 0.6) return { category: cat, sure: true };
      }
    }
    // 2) kalit so'zlar
    for (const rule of CATEGORY_RULES) {
      if (rule.re.test(upper)) {
        const cat = this.findCat(rule.cat);
        if (cat) return { category: cat, sure: true };
      }
    }
    // 3) o'xshash so'zlar (kam uchraydigan so'z — kuchliroq belgi)
    const score = new Map<number, number>();
    for (const t of new Set(ts)) {
      const counts = this.tok.get(t);
      if (!counts) continue;
      const df = [...counts.values()].reduce((a, b) => a + b, 0);
      const idf = Math.log(1 + this.total / df);
      for (const [cid, n] of counts) score.set(cid, (score.get(cid) ?? 0) + (n / df) * idf);
    }
    // Bu taxmin ishonchsiz: AI bo'lsa u tekshiradi, bo'lmasa shu ishlatiladi
    const best = [...score.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] >= 1.5) {
      const cat = byId(best[0]);
      if (cat) return { category: cat, sure: false };
    }
    const fb = this.fallback();
    return fb ? { category: fb, sure: false } : null;
  }
}
