/**
 * "Mening shokoladim": shablon + mijoz rasmi + matnni canvas'ga chizish.
 * Barcha o'lchamlar shablonning asl pikselida hisoblanadi, `scale` bilan kichraytiriladi
 * (oldindan ko'rish) yoki 1 da to'liq sifatda chiziladi (buyurtma uchun JPG).
 */

export type Area = { areaX: number; areaY: number; areaW: number; areaH: number };

export type DesignState = {
  photo: HTMLImageElement | null;
  zoom: number; // 1..3
  offX: number; // -0.5..0.5 (rasm siljishi)
  offY: number;
  text: string;
  textColor: string;
  textSize: 'S' | 'M' | 'L';
  textPos: 'top' | 'bottom';
  font?: FontKey;
};

/**
 * Matn shriftlari. Birinchisi — dasturning o'z sarlavha shrifti (standart).
 * Hammasi lotin va kirill harflarini qo'llaydi (app/index.html da ulangan).
 */
export const FONTS = {
  playfair: { family: '"Playfair Display"', weight: 700, label: 'Playfair' },
  nunito: { family: 'Nunito', weight: 800, label: 'Nunito' },
  lobster: { family: 'Lobster', weight: 400, label: 'Lobster' },
  caveat: { family: 'Caveat', weight: 700, label: 'Caveat' },
  pacifico: { family: 'Pacifico', weight: 400, label: 'Pacifico' },
} as const;
export type FontKey = keyof typeof FONTS;
export const DEFAULT_FONT: FontKey = 'playfair';

export const fontCss = (key: FontKey | undefined, px: number) => {
  const f = FONTS[key ?? DEFAULT_FONT];
  return `${f.weight} ${Math.round(px)}px ${f.family}, Georgia, serif`;
};

export const TEXT_COLORS = ['#FFFFFF', '#4A3224', '#C0392B', '#D9A066', '#111111'];
const SIZE_K = { S: 0.075, M: 0.1, L: 0.13 };

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Rasm yuklanmadi'));
    img.src = src;
  });
}

export function areaPx(area: Area, w: number, h: number) {
  return { x: area.areaX * w, y: area.areaY * h, w: area.areaW * w, h: area.areaH * h };
}

/** Rasmning maydon ichidagi joylashuvi (cover + zoom + siljish) */
export function photoRect(photo: HTMLImageElement, a: { x: number; y: number; w: number; h: number }, zoom: number, offX: number, offY: number) {
  const s = Math.max(a.w / photo.naturalWidth, a.h / photo.naturalHeight) * zoom;
  const dw = photo.naturalWidth * s;
  const dh = photo.naturalHeight * s;
  const ox = dw - a.w;
  const oy = dh - a.h;
  return { dx: a.x - ox * (0.5 + offX), dy: a.y - oy * (0.5 + offY), dw, dh, ox, oy };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function isLight(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 160;
}

/**
 * Canvas'ga chizadi. `scale` — shablon pikselidan canvas pikseliga nisbat.
 * `placeholder` — rasm yo'q bo'lganda maydonni ko'rsatish matni.
 */
export function renderDesign(
  ctx: CanvasRenderingContext2D,
  template: HTMLImageElement,
  tw: number,
  th: number,
  area: Area,
  d: DesignState,
  scale: number,
  placeholder?: string,
) {
  ctx.save();
  ctx.scale(scale, scale);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, tw, th);
  ctx.drawImage(template, 0, 0, tw, th);

  const a = areaPx(area, tw, th);
  const r = Math.min(a.w, a.h) * 0.06;

  if (d.photo) {
    ctx.save();
    roundRect(ctx, a.x, a.y, a.w, a.h, r);
    ctx.clip();
    const p = photoRect(d.photo, a, d.zoom, d.offX, d.offY);
    ctx.drawImage(d.photo, p.dx, p.dy, p.dw, p.dh);
    ctx.restore();
  } else if (placeholder) {
    ctx.save();
    roundRect(ctx, a.x, a.y, a.w, a.h, r);
    ctx.fillStyle = 'rgba(111, 78, 55, 0.08)';
    ctx.fill();
    ctx.setLineDash([a.w * 0.03, a.w * 0.02]);
    ctx.lineWidth = Math.max(2, a.w * 0.008);
    ctx.strokeStyle = 'rgba(111, 78, 55, 0.6)';
    ctx.stroke();
    ctx.fillStyle = 'rgba(74, 50, 36, 0.8)';
    ctx.font = `700 ${Math.round(a.h * 0.08)}px Nunito, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(placeholder, a.x + a.w / 2, a.y + a.h / 2, a.w * 0.9);
    ctx.restore();
  }

  const text = d.text.trim();
  if (text) {
    let size = a.h * SIZE_K[d.textSize];
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = d.textPos === 'top' ? 'top' : 'bottom';
    const setFont = () => (ctx.font = fontCss(d.font, size));
    setFont();
    // Maydonga sig'maguncha kichraytiramiz
    while (ctx.measureText(text).width > a.w * 0.92 && size > 10) {
      size *= 0.92;
      setFont();
    }
    const pad = a.h * 0.05;
    const x = a.x + a.w / 2;
    const y = d.textPos === 'top' ? a.y + pad : a.y + a.h - pad;
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, size * 0.16);
    ctx.strokeStyle = isLight(d.textColor) ? 'rgba(43, 29, 20, 0.85)' : 'rgba(255, 255, 255, 0.92)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = d.textColor;
    ctx.fillText(text, x, y);
    ctx.restore();
  }
  ctx.restore();
}

/** To'liq o'lchamdagi yakuniy JPG (buyurtma uchun) */
export async function exportDesign(template: HTMLImageElement, tw: number, th: number, area: Area, d: DesignState): Promise<Blob> {
  await ensureFonts(d.font);
  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d')!;
  renderDesign(ctx, template, tw, th, area, d, 1);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('JPG yaratilmadi'))), 'image/jpeg', 0.95));
}

/** Shrift yuklanmaguncha chizilsa, canvas oddiy shriftni ishlatib yuboradi — shuning uchun kutamiz */
export async function ensureFonts(font?: FontKey) {
  try {
    const sample = 'Aa Яя ʻ';
    await Promise.all([document.fonts.load(fontCss(font, 48), sample), document.fonts.load('700 24px Nunito', sample)]);
  } catch {
    /* shriftsiz ham chiziladi */
  }
}
