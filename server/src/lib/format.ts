import type { Language, Unit } from '@prisma/client';

export const TZ = 'Asia/Tashkent';

/** 125000 -> "125 000 so'm" */
export function formatMoney(amount: number, lang: Language = 'uz'): string {
  const n = Math.round(amount);
  const s = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${n < 0 ? '-' : ''}${s} ${lang === 'ru' ? 'сум' : "so'm"}`;
}

const UNIT_LABELS: Record<Language, Record<Unit, string>> = {
  uz: { PIECE: 'dona', KG: 'kg', GRAM: 'g', LITER: 'l', BOX: 'karobka', PACK: 'pachka' },
  ru: { PIECE: 'шт', KG: 'кг', GRAM: 'г', LITER: 'л', BOX: 'коробка', PACK: 'пачка' },
};

export function unitLabel(unit: Unit, lang: Language = 'uz') {
  return UNIT_LABELS[lang][unit];
}

export function isWeighted(unit: Unit) {
  return unit === 'KG' || unit === 'GRAM';
}

export function toNum(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  return Number(String(v));
}

/** Miqdorni 3 xonagacha yaxlitlab, ortiqcha nollarsiz: 1.500 -> "1.5" */
export function formatQty(q: unknown): string {
  const n = Math.round(toNum(q) * 1000) / 1000;
  return String(n);
}

export function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

export function lineTotal(qty: number, price: number) {
  return Math.round(qty * price);
}

/** Toshkent vaqti bo'yicha "HH:MM" */
export function nowTashkentHHMM(d = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}

export function formatDateTime(d: Date | null | undefined): string {
  if (!d) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Ish vaqti ichidami (tun orqali o'tadigan oraliq ham hisobga olinadi) */
export function isWithinWorkHours(start: string, end: string, d = new Date()): boolean {
  const now = toMinutes(nowTashkentHHMM(d));
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s === e) return true; // 24 soat
  if (s < e) return now >= s && now < e;
  return now >= s || now < e;
}

/** Toshkent vaqti bo'yicha kun boshi (UTC Date) */
export function startOfDayTashkent(d = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  // Toshkent UTC+5, yozgi vaqt yo'q
  return new Date(`${parts}T00:00:00+05:00`);
}

export function escapeHtml(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function mapsLinks(lat: number, lng: number) {
  return {
    google: `https://maps.google.com/?q=${lat},${lng}`,
    yandex: `https://yandex.uz/maps/?pt=${lng},${lat}&z=17&l=map`,
  };
}
