import type { Lang, Unit } from './types';
import i18n from './i18n';

const lang = (): Lang => (i18n.language === 'ru' ? 'ru' : 'uz');

export function money(n: number | null | undefined, l: Lang = lang()) {
  const v = Math.round(Number(n || 0));
  const s = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${v < 0 ? '-' : ''}${s} ${l === 'ru' ? 'сум' : "so'm"}`;
}

export function qty(n: number | null | undefined) {
  const v = Math.round(Number(n || 0) * 1000) / 1000;
  return String(v);
}

const UNITS: Record<Lang, Record<Unit, string>> = {
  uz: { PIECE: 'dona', KG: 'kg', GRAM: 'g', LITER: 'l', BOX: 'karobka', PACK: 'pachka' },
  ru: { PIECE: 'шт', KG: 'кг', GRAM: 'г', LITER: 'л', BOX: 'коробка', PACK: 'пачка' },
};

export const unitLabel = (u: Unit, l: Lang = lang()) => UNITS[l][u];
export const isWeighted = (u: Unit) => u === 'KG' || u === 'GRAM';

export function nameOf(x: { nameUz: string; nameRu: string } | null | undefined, l: Lang = lang()) {
  if (!x) return '';
  return (l === 'ru' ? x.nameRu : x.nameUz) || x.nameUz;
}

export function descOf(x: { descriptionUz: string; descriptionRu: string }, l: Lang = lang()) {
  return (l === 'ru' ? x.descriptionRu : x.descriptionUz) || x.descriptionUz;
}

export function dateTime(d: string | Date | null | undefined) {
  if (!d) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Tashkent',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(d));
}

export function timeOnly(d: string | Date | null | undefined) {
  if (!d) return '';
  return new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit' }).format(new Date(d));
}

export function dateOnly(d: string | Date | null | undefined) {
  if (!d) return '';
  return new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d));
}

export function todayISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());
}

export function personName(p: { firstName: string; lastName: string } | null | undefined) {
  return p ? `${p.firstName} ${p.lastName}`.trim() : '';
}

export function phoneHref(p: string | null | undefined) {
  const d = (p || '').replace(/[^\d+]/g, '');
  return d ? `tel:${d.startsWith('+') ? d : '+' + d}` : undefined;
}

export function prettyPhone(p: string | null | undefined) {
  const d = (p || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('998')) return `+998 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}`;
  return d ? `+${d}` : '';
}

export function mapsLinks(lat: number, lng: number) {
  return {
    google: `https://maps.google.com/?q=${lat},${lng}`,
    yandex: `https://yandex.uz/maps/?pt=${lng},${lat}&z=17&l=map`,
  };
}

/** step bo'yicha miqdorni to'g'rilash */
export function snapQty(value: number, step: number, min: number) {
  const s = step > 0 ? step : 1;
  const v = Math.max(min, Math.round(value / s) * s);
  return Math.round(v * 1000) / 1000;
}
