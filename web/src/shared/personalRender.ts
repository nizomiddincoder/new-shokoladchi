/**
 * "Mening shokoladim": shablon + mijoz rasmi + erkin matn / emoji / stikerlarni canvas'ga chizish.
 *
 * Har bir element — qatlam (layer): markazi (x, y — shablon o'lchamiga nisbatan 0..1),
 * o'lchami (s) va burilishi (rot). Mijoz har birini barmoq bilan suradi, kattalashtiradi, buradi.
 * Barcha hisob shablonning asl pikselida; `scale` bilan oldindan ko'rish uchun kichraytiriladi
 * yoki 1 da to'liq sifatda (buyurtma JPG) chiziladi.
 */

export type Area = { areaX: number; areaY: number; areaW: number; areaH: number };

export type LayerKind = 'photo' | 'text' | 'emoji';

export type Layer = {
  id: string;
  kind: LayerKind;
  /** Markaz: shablon kengligi/balandligiga nisbatan (0..1, chegaradan chiqishi ham mumkin) */
  x: number;
  y: number;
  /** photo: kengligi (shablon kengligiga nisbatan); text/emoji: shrift o'lchami (shablon balandligiga nisbatan) */
  s: number;
  /** Burilish, radian */
  rot: number;
  text?: string;
  color?: string;
  font?: FontKey;
};

export type DesignState = {
  /** Mijoz rasmi (AI fonsiz varianti yoki asl rasm) */
  photo: HTMLImageElement | null;
  layers: Layer[];
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

/** Emoji telefonning o'z emoji shriftida chiziladi */
const EMOJI_FAMILY = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Segoe UI Symbol", sans-serif';

export const fontCss = (key: FontKey | undefined, px: number) => {
  const f = FONTS[key ?? DEFAULT_FONT];
  // Matn ichidagi emojilar ham chiqishi uchun emoji shriftlari zaxira sifatida
  return `${f.weight} ${Math.round(px)}px ${f.family}, ${EMOJI_FAMILY}`;
};
const emojiCss = (px: number) => `${Math.round(px)}px ${EMOJI_FAMILY}`;

export const TEXT_COLORS = ['#FFFFFF', '#111111', '#4A3224', '#D9A066', '#C0392B', '#E91E63', '#8E44AD', '#1E88E5', '#2E7D32', '#F1C40F'];

/** Tayyor emoji va stikerlar (telefon klaviaturasidagi istalgan emoji ham qo'shiladi) */
export const STICKER_GROUPS: { key: string; items: string[] }[] = [
  { key: 'love', items: ['❤️', '💖', '💕', '💘', '💝', '😍', '🥰', '😘', '💋', '🌹', '💐', '🌸', '🌷', '🌺', '🌻', '💍'] },
  { key: 'party', items: ['🎉', '🎊', '🎂', '🍰', '🧁', '🎁', '🎈', '🥳', '🎀', '🍾', '🥂', '🎆', '✨', '🎇', '🪅', '🕯️'] },
  { key: 'fun', items: ['😀', '😂', '😎', '🤩', '😇', '🤗', '😜', '🙌', '👍', '👏', '🤝', '💪', '🙏', '👑', '🔥', '💯'] },
  { key: 'sweet', items: ['🍫', '🍬', '🍭', '🍩', '🍪', '🍓', '🍒', '🍯', '☕', '🧸', '🦋', '🌈', '⭐', '🌟', '🌙', '☀️'] },
  { key: 'family', items: ['👨‍👩‍👧', '👨‍👩‍👧‍👦', '👩‍❤️‍👨', '👶', '👧', '👦', '👩', '👨', '👵', '👴', '🐱', '🐶', '🏆', '🎓', '🇺🇿', '🕌'] },
];

let seq = 0;
export const newId = () => `l${Date.now().toString(36)}${(seq++).toString(36)}`;

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

/**
 * Rasmni shablondagi joyga butunligicha (kesmasdan) sig'diradi: kenglik yoki balandlik bo'yicha
 * to'liq kiradi, gorizontal markazda, pastki chetga tekislanadi (odam "turgandek" ko'rinadi).
 */
export function fitPhotoLayer(photo: HTMLImageElement, area: Area, tw: number, th: number, id = newId()): Layer {
  const a = areaPx(area, tw, th);
  const ratio = photo.naturalWidth / photo.naturalHeight;
  let w = a.w;
  let h = w / ratio;
  if (h > a.h) {
    h = a.h;
    w = h * ratio;
  }
  return { id, kind: 'photo', x: (a.x + a.w / 2) / tw, y: (a.y + a.h - h / 2) / th, s: w / tw, rot: 0 };
}

/** Yangi matn qatlami: rasm joyining pastki qismida */
export function newTextLayer(area: Area, text: string, color = '#FFFFFF', font: FontKey = DEFAULT_FONT): Layer {
  return { id: newId(), kind: 'text', x: area.areaX + area.areaW / 2, y: area.areaY + area.areaH * 0.85, s: area.areaH * 0.1, rot: 0, text, color, font };
}

/** Yangi emoji/stiker: rasm joyining yuqori o'ng tomonida, biroz tasodifiy siljish bilan */
export function newEmojiLayer(area: Area, emoji: string): Layer {
  const jitter = () => (Math.random() - 0.5) * 0.08;
  return {
    id: newId(),
    kind: 'emoji',
    x: area.areaX + area.areaW * (0.75 + jitter()),
    y: area.areaY + area.areaH * (0.22 + jitter()),
    s: area.areaH * 0.16,
    rot: (Math.random() - 0.5) * 0.4,
    text: emoji,
  };
}

/** Admin oldindan ko'rishi va boshlang'ich holat uchun dizayn */
export function makeDesign(area: Area, tw: number, th: number, photo: HTMLImageElement | null, text = ''): DesignState {
  const layers: Layer[] = [];
  if (photo) layers.push(fitPhotoLayer(photo, area, tw, th, 'photo'));
  if (text) layers.push(newTextLayer(area, text));
  return { photo, layers };
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

/** Rasmda shaffof joy bormi (AI fonni olib tashlagan PNG) — bo'lmasa burchaklar yumaloqlanadi */
const transparencyCache = new WeakMap<HTMLImageElement, boolean>();
function hasTransparency(img: HTMLImageElement) {
  const cached = transparencyCache.get(img);
  if (cached !== undefined) return cached;
  let result = false;
  try {
    const c = document.createElement('canvas');
    const k = Math.min(1, 64 / Math.max(img.naturalWidth, img.naturalHeight));
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const x = c.getContext('2d')!;
    x.drawImage(img, 0, 0, c.width, c.height);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < d.length; i += 4) {
      if (d[i] < 200) {
        result = true;
        break;
      }
    }
  } catch {
    result = false;
  }
  transparencyCache.set(img, result);
  return result;
}

/** O'lchash uchun yordamchi canvas */
let measureCtx: CanvasRenderingContext2D | null = null;
const mctx = () => (measureCtx ??= document.createElement('canvas').getContext('2d')!);

const textLines = (l: Layer) => (l.text || '').split('\n');

/** Qatlamning burilmagan holatdagi o'lchami (shablon pikselida) */
export function layerSize(l: Layer, d: DesignState, tw: number, th: number): { w: number; h: number } {
  if (l.kind === 'photo') {
    const p = d.photo;
    if (!p) return { w: 0, h: 0 };
    const w = l.s * tw;
    return { w, h: (w * p.naturalHeight) / p.naturalWidth };
  }
  const px = l.s * th;
  const ctx = mctx();
  ctx.font = l.kind === 'emoji' ? emojiCss(px) : fontCss(l.font, px);
  const lines = textLines(l);
  const w = Math.max(...lines.map((s) => ctx.measureText(s || ' ').width));
  const lh = l.kind === 'emoji' ? px * 1.15 : px * 1.2;
  return { w: Math.max(w, px * 0.4), h: lh * lines.length };
}

/** Nuqta (shablon pikselida) qatlam ichidami — burilish hisobga olinadi */
export function hitLayer(l: Layer, d: DesignState, tw: number, th: number, px: number, py: number, pad = 0) {
  const { w, h } = layerSize(l, d, tw, th);
  const dx = px - l.x * tw;
  const dy = py - l.y * th;
  const c = Math.cos(-l.rot);
  const s = Math.sin(-l.rot);
  const lx = dx * c - dy * s;
  const ly = dx * s + dy * c;
  return Math.abs(lx) <= w / 2 + pad && Math.abs(ly) <= h / 2 + pad;
}

/** Qatlam burchagining (lokal sx, sy = ±1) shablondagi koordinatasi */
export function layerCorner(l: Layer, d: DesignState, tw: number, th: number, sx: number, sy: number, pad = 0) {
  const { w, h } = layerSize(l, d, tw, th);
  const lx = sx * (w / 2 + pad);
  const ly = sy * (h / 2 + pad);
  const c = Math.cos(l.rot);
  const s = Math.sin(l.rot);
  return { x: l.x * tw + lx * c - ly * s, y: l.y * th + lx * s + ly * c };
}

function drawLayer(ctx: CanvasRenderingContext2D, l: Layer, d: DesignState, tw: number, th: number) {
  ctx.save();
  ctx.translate(l.x * tw, l.y * th);
  ctx.rotate(l.rot);
  if (l.kind === 'photo') {
    const p = d.photo;
    if (p) {
      const { w, h } = layerSize(l, d, tw, th);
      if (!hasTransparency(p)) {
        // Oddiy (fonli) rasm: yumaloq burchaklar va yengil soya
        ctx.shadowColor = 'rgba(0,0,0,0.25)';
        ctx.shadowBlur = Math.min(w, h) * 0.03;
        roundRect(ctx, -w / 2, -h / 2, w, h, Math.min(w, h) * 0.06);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.clip();
      }
      ctx.drawImage(p, -w / 2, -h / 2, w, h);
    }
  } else {
    const px = l.s * th;
    const lines = textLines(l);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (l.kind === 'emoji') {
      ctx.font = emojiCss(px);
      const lh = px * 1.15;
      lines.forEach((s, i) => ctx.fillText(s, 0, (i - (lines.length - 1) / 2) * lh));
    } else {
      ctx.font = fontCss(l.font, px);
      const lh = px * 1.2;
      const color = l.color || '#FFFFFF';
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(2, px * 0.16);
      ctx.strokeStyle = isLight(color) ? 'rgba(43, 29, 20, 0.85)' : 'rgba(255, 255, 255, 0.92)';
      lines.forEach((s, i) => {
        const y = (i - (lines.length - 1) / 2) * lh;
        ctx.strokeText(s, 0, y);
      });
      ctx.fillStyle = color;
      lines.forEach((s, i) => ctx.fillText(s, 0, (i - (lines.length - 1) / 2) * lh));
    }
  }
  ctx.restore();
}

export type RenderOpts = {
  /** Rasm yo'q bo'lganda maydonda ko'rsatiladigan matn */
  placeholder?: string;
  /** Tanlangan qatlam: atrofida ramka va boshqaruv tugmalari chiziladi (faqat oldindan ko'rishda) */
  selectedId?: string | null;
  /** Ekrandagi 1 piksel nechta shablon pikseliga teng (tutqichlar o'lchami uchun) */
  pxToTpl?: number;
};

/** Tanlangan qatlam tutqichlari: o'ng-past — o'lcham/burish, o'ng-yuqori — o'chirish */
export const HANDLE_R = 13; // ekran pikselida
export function handlePositions(l: Layer, d: DesignState, tw: number, th: number, pxToTpl: number) {
  const pad = 6 * pxToTpl;
  return {
    resize: layerCorner(l, d, tw, th, 1, 1, pad),
    remove: layerCorner(l, d, tw, th, 1, -1, pad),
  };
}

export function renderDesign(
  ctx: CanvasRenderingContext2D,
  template: HTMLImageElement,
  tw: number,
  th: number,
  area: Area,
  d: DesignState,
  scale: number,
  opts: RenderOpts = {},
) {
  ctx.save();
  ctx.scale(scale, scale);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, tw, th);
  ctx.drawImage(template, 0, 0, tw, th);

  if (!d.photo && opts.placeholder) {
    const a = areaPx(area, tw, th);
    const r = Math.min(a.w, a.h) * 0.06;
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
    ctx.fillText(opts.placeholder, a.x + a.w / 2, a.y + a.h / 2, a.w * 0.9);
    ctx.restore();
  }

  for (const l of d.layers) {
    if (l.kind === 'photo' && !d.photo) continue;
    if (l.kind !== 'photo' && !(l.text || '').trim()) continue;
    drawLayer(ctx, l, d, tw, th);
  }

  // Tanlangan qatlam ramkasi va tutqichlari
  const sel = opts.selectedId ? d.layers.find((l) => l.id === opts.selectedId) : null;
  if (sel && opts.pxToTpl) {
    const k = opts.pxToTpl;
    const { w, h } = layerSize(sel, d, tw, th);
    const pad = 6 * k;
    ctx.save();
    ctx.translate(sel.x * tw, sel.y * th);
    ctx.rotate(sel.rot);
    ctx.setLineDash([6 * k, 4 * k]);
    ctx.lineWidth = 2 * k;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.strokeRect(-w / 2 - pad, -h / 2 - pad, w + pad * 2, h + pad * 2);
    ctx.lineDashOffset = 5 * k;
    ctx.strokeStyle = 'rgba(111, 78, 55, 0.95)';
    ctx.strokeRect(-w / 2 - pad, -h / 2 - pad, w + pad * 2, h + pad * 2);
    ctx.restore();

    const hp = handlePositions(sel, d, tw, th, k);
    const r = HANDLE_R * k;
    // O'lcham / burish
    ctx.save();
    ctx.beginPath();
    ctx.arc(hp.resize.x, hp.resize.y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#6F4E37';
    ctx.fill();
    ctx.lineWidth = 2 * k;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.lineWidth = 2 * k;
    ctx.beginPath();
    ctx.arc(hp.resize.x, hp.resize.y, r * 0.5, -Math.PI * 0.1, Math.PI * 1.35);
    ctx.stroke();
    // O'chirish
    ctx.beginPath();
    ctx.arc(hp.remove.x, hp.remove.y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#C0392B';
    ctx.fill();
    ctx.stroke();
    const q = r * 0.4;
    ctx.beginPath();
    ctx.moveTo(hp.remove.x - q, hp.remove.y - q);
    ctx.lineTo(hp.remove.x + q, hp.remove.y + q);
    ctx.moveTo(hp.remove.x + q, hp.remove.y - q);
    ctx.lineTo(hp.remove.x - q, hp.remove.y + q);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

/** To'liq o'lchamdagi yakuniy JPG (buyurtma uchun) */
export async function exportDesign(template: HTMLImageElement, tw: number, th: number, area: Area, d: DesignState): Promise<Blob> {
  await ensureFonts(d);
  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d')!;
  renderDesign(ctx, template, tw, th, area, d, 1);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('JPG yaratilmadi'))), 'image/jpeg', 0.95));
}

/** Shrift yuklanmaguncha chizilsa, canvas oddiy shriftni ishlatib yuboradi — shuning uchun kutamiz */
export async function ensureFonts(d?: DesignState) {
  try {
    const sample = 'Aa Яя ʻ';
    const used = new Set<FontKey>([DEFAULT_FONT]);
    d?.layers.forEach((l) => l.kind === 'text' && used.add(l.font ?? DEFAULT_FONT));
    await Promise.all([...[...used].map((f) => document.fonts.load(fontCss(f, 48), sample)), document.fonts.load('700 24px Nunito', sample)]);
  } catch {
    /* shriftsiz ham chiziladi */
  }
}
