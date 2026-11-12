import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Camera,
  Copy,
  Gift,
  ImagePlus,
  Loader2,
  Maximize,
  RotateCw,
  ShoppingBag,
  Smile,
  Trash2,
  Type,
  WandSparkles,
  ZoomIn,
} from 'lucide-react';
import { upload, uploadForBlob, get } from '../../shared/api';
import type { PersonalTemplate } from '../../shared/types';
import { Button, Card, Empty, ErrorState, Modal, PageLoader, Stepper, clsx, useToast } from '../../shared/ui';
import { CameraCapture, cameraSupported } from '../../shared/CameraCapture';
import {
  DEFAULT_FONT,
  FONTS,
  HANDLE_R,
  STICKER_GROUPS,
  TEXT_COLORS,
  type DesignState,
  type FontKey,
  type Layer,
  ensureFonts,
  exportDesign,
  fitPhotoLayer,
  handlePositions,
  hitLayer,
  loadImage,
  newEmojiLayer,
  newId,
  newTextLayer,
  renderDesign,
} from '../../shared/personalRender';
import { money, unitLabel } from '../../shared/format';
import { haptic } from '../../shared/telegram';
import { PageHeader } from '../layout';

export type PersonalCheckoutState = {
  templateId: number;
  designUrl: string;
  qty: number;
  previewUrl: string;
  title: string;
  price: number;
  unit: PersonalTemplate['product']['unit'];
};

const PHOTO_ID = 'photo';
const MAX_SIDE = 2000;

/** Katta telefon rasmlarini yuborishdan oldin kichraytiramiz (tezroq yuklanadi, xotira tejaladi) */
async function shrinkPhoto(file: File): Promise<{ blob: Blob; img: HTMLImageElement }> {
  const url = URL.createObjectURL(file);
  const img = await loadImage(url);
  const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  if (k === 1 && file.type === 'image/jpeg') return { blob: file, img };
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k);
  c.height = Math.round(img.naturalHeight * k);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Rasm tayyorlanmadi'))), 'image/jpeg', 0.92));
  return { blob, img: await loadImage(URL.createObjectURL(blob)) };
}

type Gesture =
  | { mode: 'drag'; id: string; offX: number; offY: number }
  | { mode: 'transform'; id: string; cx: number; cy: number; d0: number; a0: number; s0: number; r0: number; pinch: boolean; mx0: number; my0: number; x0: number; y0: number }
  | null;

const clampS = (l: Layer, s: number) => (l.kind === 'photo' ? Math.min(3, Math.max(0.05, s)) : Math.min(1.2, Math.max(0.02, s)));

export function PersonalPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const q = useQuery({ queryKey: ['personal-templates'], queryFn: () => get<PersonalTemplate[]>('/catalog/personal-templates') });
  const [tplId, setTplId] = useState<number | null>(null);
  const [tplImg, setTplImg] = useState<HTMLImageElement | null>(null);
  const [orig, setOrig] = useState<HTMLImageElement | null>(null);
  const [cut, setCut] = useState<HTMLImageElement | null>(null);
  const [useCut, setUseCut] = useState(true);
  const [ai, setAi] = useState<'idle' | 'working' | 'failed' | 'done'>('idle');
  const [layers, setLayers] = useState<Layer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [camOpen, setCamOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fontsTick, setFontsTick] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture>(null);
  const photoToken = useRef(0);
  const [width, setWidth] = useState(360);

  const tpl = q.data?.find((x) => x.id === tplId) ?? q.data?.[0] ?? null;
  const title = tpl ? (i18n.language === 'ru' && tpl.titleRu ? tpl.titleRu : tpl.titleUz) : '';
  const photo = useCut && cut ? cut : orig;
  const d: DesignState = { photo, layers };
  const selected = layers.find((l) => l.id === selectedId) ?? null;

  // Barcha shriftlarni oldindan yuklab olamiz — keyin chizish sinxron va tez
  useEffect(() => {
    void ensureFonts({ photo: null, layers: (Object.keys(FONTS) as FontKey[]).map((font) => ({ id: font, kind: 'text', x: 0, y: 0, s: 0, rot: 0, font })) }).then(() =>
      setFontsTick((n) => n + 1),
    );
  }, []);

  useEffect(() => {
    if (!tpl) return;
    let alive = true;
    setTplImg(null);
    loadImage(tpl.imageUrl)
      .then((img) => alive && setTplImg(img))
      .catch((e) => toast.error(e));
    setQty(tpl.product.minQty || 1);
    return () => {
      alive = false;
    };
  }, [tpl?.id]);

  // Shablon almashsa — rasm yangi shablon joyiga moslanadi, matnlar nisbatan saqlanadi
  useEffect(() => {
    if (!tpl || !photo) return;
    setLayers((ls) => ls.map((l) => (l.kind === 'photo' ? fitPhotoLayer(photo, tpl, tpl.width, tpl.height, l.id) : l)));
  }, [tpl?.id]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [tplImg]);

  // Oldindan ko'rish
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !tpl || !tplImg) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = (width / tpl.width) * dpr;
    const cw = Math.round(tpl.width * scale);
    const ch = Math.round(tpl.height * scale);
    if (c.width !== cw || c.height !== ch) {
      c.width = cw;
      c.height = ch;
    }
    c.style.width = `${width}px`;
    c.style.height = `${(width * tpl.height) / tpl.width}px`;
    const ctx = c.getContext('2d')!;
    renderDesign(ctx, tplImg, tpl.width, tpl.height, tpl, d, scale, {
      placeholder: t('personal.placeholder'),
      selectedId,
      pxToTpl: tpl.width / width,
    });
  }, [tpl, tplImg, photo, layers, selectedId, width, fontsTick]);

  const updateLayer = (id: string, patch: Partial<Layer>) => setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const removeLayer = (id: string) => {
    haptic('light');
    if (id === PHOTO_ID) {
      photoToken.current++;
      setOrig(null);
      setCut(null);
      setAi('idle');
    }
    setLayers((ls) => ls.filter((l) => l.id !== id));
    setSelectedId(null);
  };

  const placePhoto = (img: HTMLImageElement) => {
    if (!tpl) return;
    const layer = fitPhotoLayer(img, tpl, tpl.width, tpl.height, PHOTO_ID);
    setLayers((ls) => (ls.some((l) => l.id === PHOTO_ID) ? ls.map((l) => (l.id === PHOTO_ID ? layer : l)) : [layer, ...ls]));
    setSelectedId(PHOTO_ID);
  };

  const setPhotoFile = async (file: File | undefined) => {
    if (!file || !tpl) return;
    const token = ++photoToken.current;
    try {
      const { blob, img } = await shrinkPhoto(file);
      setOrig(img);
      setCut(null);
      setUseCut(true);
      placePhoto(img);
      haptic('success');
      // AI: fonni olib tashlab, odamni shablonga moslab beradi
      setAi('working');
      try {
        const png = await uploadForBlob('/shop/personal/cutout', blob);
        const cutImg = await loadImage(URL.createObjectURL(png));
        if (token !== photoToken.current) return;
        setCut(cutImg);
        setAi('done');
        placePhoto(cutImg);
        haptic('success');
      } catch (e) {
        if (token !== photoToken.current) return;
        setAi('failed');
        toast.error(new Error(`${t('personal.aiFailed')}${e instanceof Error && e.message ? ` (${e.message})` : ''}`));
      }
    } catch (e) {
      toast.error(e);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const toggleCut = (v: boolean) => {
    setUseCut(v);
    const img = v && cut ? cut : orig;
    if (img) placePhoto(img);
  };

  const addText = () => {
    if (!tpl) return;
    const l = newTextLayer(tpl, t('personal.newText'), '#FFFFFF', DEFAULT_FONT);
    // Bir nechta matn ustma-ust tushmasin
    const n = layers.filter((x) => x.kind === 'text').length;
    l.y = Math.max(0.06, l.y - n * 0.12);
    setLayers((ls) => [...ls, l]);
    setSelectedId(l.id);
    setTimeout(() => {
      textRef.current?.focus();
      textRef.current?.select();
    }, 50);
  };

  const addEmoji = (e: string) => {
    if (!tpl || !e.trim()) return;
    const l = newEmojiLayer(tpl, e.trim());
    setLayers((ls) => [...ls, l]);
    setSelectedId(l.id);
    setPickerOpen(false);
    haptic('light');
  };

  const duplicate = (l: Layer) => {
    const copy = { ...l, id: newId(), x: l.x + 0.03, y: l.y + 0.04 };
    setLayers((ls) => [...ls, copy]);
    setSelectedId(copy.id);
  };

  const reorder = (id: string, front: boolean) =>
    setLayers((ls) => {
      const l = ls.find((x) => x.id === id);
      if (!l) return ls;
      const rest = ls.filter((x) => x.id !== id);
      return front ? [...rest, l] : [l, ...rest];
    });

  // ---------- Barmoq / sichqoncha bilan boshqarish ----------
  const toTpl = (clientX: number, clientY: number) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((clientX - r.left) * tpl!.width) / r.width, y: ((clientY - r.top) * tpl!.height) / r.height };
  };

  const startTransform = (l: Layer, a: { x: number; y: number }, b: { x: number; y: number } | null) => {
    const cx = l.x * tpl!.width;
    const cy = l.y * tpl!.height;
    // Pinch: ikki barmoq orasidagi masofa/burchak; tutqich: markaz va barmoq orasidagi
    const p1 = b ? a : { x: cx, y: cy };
    const p2 = b ?? a;
    gesture.current = {
      mode: 'transform',
      id: l.id,
      cx,
      cy,
      d0: Math.max(1, Math.hypot(p2.x - p1.x, p2.y - p1.y)),
      a0: Math.atan2(p2.y - p1.y, p2.x - p1.x),
      s0: l.s,
      r0: l.rot,
      pinch: !!b,
      mx0: b ? (a.x + b.x) / 2 : 0,
      my0: b ? (a.y + b.y) / 2 : 0,
      x0: l.x,
      y0: l.y,
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!tpl) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toTpl(e.clientX, e.clientY);
    pointers.current.set(e.pointerId, p);
    const k = tpl.width / width;

    if (pointers.current.size === 2) {
      const sel = layers.find((l) => l.id === selectedId);
      if (sel) {
        const [a, b] = [...pointers.current.values()];
        startTransform(sel, a, b);
      }
      return;
    }
    if (pointers.current.size > 2) return;

    // Tanlangan qatlamning tutqichlari
    if (selected) {
      const hp = handlePositions(selected, d, tpl.width, tpl.height, k);
      const near = (h: { x: number; y: number }) => Math.hypot(h.x - p.x, h.y - p.y) <= HANDLE_R * k * 1.5;
      if (near(hp.remove)) {
        removeLayer(selected.id);
        pointers.current.delete(e.pointerId);
        return;
      }
      if (near(hp.resize)) {
        startTransform(selected, p, null);
        return;
      }
    }
    // Eng ustki qatlamdan boshlab qidiramiz
    const hit = [...layers].reverse().find((l) => (l.kind !== 'photo' || photo) && hitLayer(l, d, tpl.width, tpl.height, p.x, p.y, 8 * k));
    if (hit) {
      if (hit.id !== selectedId) haptic('light');
      setSelectedId(hit.id);
      gesture.current = { mode: 'drag', id: hit.id, offX: p.x - hit.x * tpl.width, offY: p.y - hit.y * tpl.height };
    } else {
      setSelectedId(null);
      gesture.current = null;
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!tpl || !pointers.current.has(e.pointerId)) return;
    const p = toTpl(e.clientX, e.clientY);
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (!g) return;
    const l = layers.find((x) => x.id === g.id);
    if (!l) return;
    if (g.mode === 'drag') {
      updateLayer(g.id, { x: (p.x - g.offX) / tpl.width, y: (p.y - g.offY) / tpl.height });
      return;
    }
    let p1: { x: number; y: number };
    let p2: { x: number; y: number };
    if (g.pinch) {
      const pts = [...pointers.current.values()];
      if (pts.length < 2) return;
      [p1, p2] = pts;
    } else {
      p1 = { x: g.cx, y: g.cy };
      p2 = p;
    }
    const dist = Math.max(1, Math.hypot(p2.x - p1.x, p2.y - p1.y));
    const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    let rot = g.r0 + (ang - g.a0);
    // 0°, 90°... ga yaqin bo'lsa yopishadi (tekis qo'yish oson bo'lsin)
    const snap = Math.round(rot / (Math.PI / 2)) * (Math.PI / 2);
    if (Math.abs(rot - snap) < 0.06) rot = snap;
    const patch: Partial<Layer> = { s: clampS(l, (g.s0 * dist) / g.d0), rot };
    if (g.pinch) {
      patch.x = g.x0 + ((p1.x + p2.x) / 2 - g.mx0) / tpl.width;
      patch.y = g.y0 + ((p1.y + p2.y) / 2 - g.my0) / tpl.height;
    }
    updateLayer(g.id, patch);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g?.mode === 'transform' && g.pinch && pointers.current.size === 1 && tpl) {
      // Bitta barmoq qoldi — surishda davom etamiz
      const [p] = [...pointers.current.values()];
      const l = layers.find((x) => x.id === g.id);
      if (l) gesture.current = { mode: 'drag', id: l.id, offX: p.x - l.x * tpl.width, offY: p.y - l.y * tpl.height };
      return;
    }
    if (pointers.current.size === 0) gesture.current = null;
  };

  // Kompyuterda: g'ildirak bilan kattalashtirish
  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (!selected) return;
    updateLayer(selected.id, { s: clampS(selected, selected.s * (e.deltaY < 0 ? 1.06 : 1 / 1.06)) });
  };

  const onDoubleClick = () => {
    if (selected?.kind === 'text') textRef.current?.focus();
  };

  const order = async () => {
    if (!tpl || !tplImg) return;
    if (!photo) {
      toast.error(new Error(t('personal.needPhoto')));
      return;
    }
    setBusy(true);
    setSelectedId(null);
    try {
      const blob = await exportDesign(tplImg, tpl.width, tpl.height, tpl, d);
      const file = new File([blob], 'design.jpg', { type: 'image/jpeg' });
      const r = await upload<{ url: string }>('/shop/designs', file);
      const state: PersonalCheckoutState = {
        templateId: tpl.id,
        designUrl: r.url,
        qty,
        previewUrl: r.url,
        title,
        price: tpl.product.price,
        unit: tpl.product.unit,
      };
      navigate('/personal/checkout', { state });
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  if (q.isLoading) return <PageLoader />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  const sizePercent = selected ? Math.round(selected.s * (selected.kind === 'photo' ? 100 : 500)) : 0;

  return (
    <div className="fade-in mx-auto max-w-xl" style={{ paddingBottom: 'calc(var(--safe-bottom) + 100px)' }}>
      <PageHeader title={t('personal.title')} />
      {!q.data?.length || !tpl ? (
        <Empty icon={Gift} title={t('personal.noTemplates')} />
      ) : (
        <div className="space-y-3 px-4 pt-3">
          <div className="rounded-2xl bg-gradient-to-br from-[#4A3224] to-[#A47551] p-4 text-white">
            <div className="font-display text-[20px] font-bold">{t('personal.heroTitle')}</div>
            <div className="mt-1 text-[13px] opacity-90">{t('personal.heroText')}</div>
          </div>

          {q.data.length > 1 && (
            <div className="no-scrollbar flex gap-2 overflow-x-auto">
              {q.data.map((x) => (
                <button
                  key={x.id}
                  onClick={() => setTplId(x.id)}
                  className={clsx('w-28 shrink-0 overflow-hidden rounded-xl border-2 bg-white', tpl.id === x.id ? 'border-primary' : 'border-transparent')}
                >
                  <img src={x.imageUrl} alt="" className="aspect-[1.8/1] w-full object-contain" />
                  <div className="truncate px-1.5 py-1 text-[11px] font-semibold text-ink">{i18n.language === 'ru' && x.titleRu ? x.titleRu : x.titleUz}</div>
                </button>
              ))}
            </div>
          )}

          {/* Oldindan ko'rish va tahrirlash maydoni */}
          <Card className="overflow-hidden p-2">
            <div ref={wrapRef} className="relative w-full">
              {tplImg ? (
                <canvas
                  ref={canvasRef}
                  className="block touch-none select-none rounded-xl"
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                  onWheel={onWheel}
                  onDoubleClick={onDoubleClick}
                />
              ) : (
                <div className="skeleton aspect-[1.8/1] w-full rounded-xl" />
              )}
              {ai === 'working' && (
                <div className="pointer-events-none absolute inset-x-2 bottom-2 flex items-center justify-center gap-2 rounded-xl bg-black/65 px-3 py-2 text-[12.5px] font-semibold text-white">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('personal.aiWorking')}
                </div>
              )}
            </div>
            <div className="px-2 pb-1 pt-2 text-center text-[12px] text-muted">{t('personal.editHint')}</div>
          </Card>

          {/* Asboblar */}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => setPhotoFile(e.target.files?.[0])} />
          <div className="grid grid-cols-4 gap-2">
            <ToolButton icon={ImagePlus} label={t('personal.upload')} onClick={() => fileRef.current?.click()} />
            <ToolButton icon={Camera} label={t('personal.selfie')} onClick={() => (cameraSupported() ? setCamOpen(true) : fileRef.current?.click())} />
            <ToolButton icon={Type} label={t('personal.addText')} onClick={addText} />
            <ToolButton icon={Smile} label={t('personal.addSticker')} onClick={() => setPickerOpen(true)} />
          </div>

          {/* AI fon olib tashlash holati */}
          {orig && (
            <Card className="flex items-center gap-3 p-3">
              <span className={clsx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', ai === 'failed' ? 'bg-danger-soft text-danger' : 'bg-primary-soft text-primary')}>
                {ai === 'working' ? <Loader2 className="h-5 w-5 animate-spin" /> : <WandSparkles className="h-5 w-5" />}
              </span>
              <div className="min-w-0 flex-1 text-[13px]">
                <div className="font-bold">{t('personal.removeBg')}</div>
                <div className="text-muted">
                  {ai === 'working' ? t('personal.aiWorking') : ai === 'failed' ? t('personal.aiFailedShort') : t('personal.aiDoneHint')}
                </div>
              </div>
              {cut && (
                <div className="flex shrink-0 rounded-xl bg-surface p-0.5 text-[12px] font-bold">
                  <button onClick={() => toggleCut(true)} className={clsx('rounded-lg px-2.5 py-1.5', useCut ? 'bg-primary text-white' : 'text-muted')}>
                    AI
                  </button>
                  <button onClick={() => toggleCut(false)} className={clsx('rounded-lg px-2.5 py-1.5', !useCut ? 'bg-primary text-white' : 'text-muted')}>
                    {t('personal.original')}
                  </button>
                </div>
              )}
            </Card>
          )}

          {/* Tanlangan element sozlamalari */}
          {selected && (selected.kind !== 'photo' || photo) && (
            <Card className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[14px] font-bold">
                  {selected.kind === 'photo' ? t('personal.photo') : selected.kind === 'text' ? t('personal.textLayer') : t('personal.sticker')}
                </div>
                <div className="flex gap-1">
                  <SmallIcon icon={ArrowUpToLine} label={t('personal.toFront')} onClick={() => reorder(selected.id, true)} />
                  <SmallIcon icon={ArrowDownToLine} label={t('personal.toBack')} onClick={() => reorder(selected.id, false)} />
                  {selected.kind !== 'photo' && <SmallIcon icon={Copy} label={t('personal.duplicate')} onClick={() => duplicate(selected)} />}
                  {selected.kind === 'photo' && photo && (
                    <SmallIcon icon={Maximize} label={t('personal.fit')} onClick={() => placePhoto(photo)} />
                  )}
                  <SmallIcon icon={Trash2} label={t('common.delete')} danger onClick={() => removeLayer(selected.id)} />
                </div>
              </div>

              {selected.kind === 'text' && (
                <>
                  <textarea
                    ref={textRef}
                    rows={2}
                    maxLength={120}
                    className="input min-h-[64px] resize-none py-2.5"
                    value={selected.text}
                    placeholder={t('personal.textPh')}
                    onChange={(e) => updateLayer(selected.id, { text: e.target.value })}
                  />
                  <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
                    {(Object.keys(FONTS) as FontKey[]).map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => updateLayer(selected.id, { font: k })}
                        className={clsx(
                          'flex h-14 min-w-[86px] shrink-0 flex-col items-center justify-center rounded-xl border px-3',
                          (selected.font ?? DEFAULT_FONT) === k ? 'border-primary bg-primary-soft text-primary-dark' : 'border-line bg-card text-ink',
                        )}
                      >
                        <span style={{ fontFamily: FONTS[k].family, fontWeight: FONTS[k].weight }} className="text-[19px] leading-none">
                          Aa Яя
                        </span>
                        <span className="mt-1 text-[10px] font-semibold text-muted">{k === DEFAULT_FONT ? t('personal.fontApp') : FONTS[k].label}</span>
                      </button>
                    ))}
                  </div>
                  <div className="no-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1 py-0.5">
                    {TEXT_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => updateLayer(selected.id, { color: c })}
                        className={clsx('h-8 w-8 shrink-0 rounded-full border-2', selected.color === c ? 'border-primary ring-2 ring-primary-soft' : 'border-line')}
                        style={{ background: c }}
                        aria-label={c}
                      />
                    ))}
                    <label className="relative h-8 w-8 shrink-0 cursor-pointer overflow-hidden rounded-full border-2 border-line bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)]" title={t('personal.color')}>
                      <input
                        type="color"
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        value={selected.color || '#ffffff'}
                        onChange={(e) => updateLayer(selected.id, { color: e.target.value.toUpperCase() })}
                      />
                    </label>
                  </div>
                </>
              )}

              <SliderRow
                icon={ZoomIn}
                label={t('personal.size')}
                value={selected.s}
                min={selected.kind === 'photo' ? 0.05 : 0.02}
                max={selected.kind === 'photo' ? 2 : 0.6}
                step={0.001}
                display={`${sizePercent}%`}
                onChange={(v) => updateLayer(selected.id, { s: v })}
              />
              <SliderRow
                icon={RotateCw}
                label={t('personal.rotate')}
                value={(selected.rot * 180) / Math.PI}
                min={-180}
                max={180}
                step={1}
                display={`${Math.round((selected.rot * 180) / Math.PI)}°`}
                onChange={(v) => updateLayer(selected.id, { rot: (v * Math.PI) / 180 })}
              />
            </Card>
          )}

          {/* Miqdor va narx */}
          <Card className="flex items-center justify-between p-4">
            <div>
              <div className="text-[13px] font-semibold text-muted">{title}</div>
              <div className="font-display text-[20px] font-bold text-primary">{money(Math.round(qty * tpl.product.price))}</div>
              <div className="text-[12px] text-muted">
                {money(tpl.product.price)} / {unitLabel(tpl.product.unit)}
              </div>
            </div>
            <Stepper value={qty} step={tpl.product.step || 1} min={tpl.product.minQty || 1} max={tpl.product.stock} onChange={(v) => setQty(Math.max(tpl.product.minQty || 1, v))} />
          </Card>
        </div>
      )}

      {tpl && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card px-4 pt-3" style={{ paddingBottom: 'calc(var(--safe-bottom) + 12px)' }}>
          <div className="mx-auto max-w-xl">
            <Button block size="lg" icon={ShoppingBag} loading={busy} disabled={!tpl.product.inStock || ai === 'working'} onClick={order}>
              {tpl.product.inStock ? t('personal.order') : t('product.outOfStock')}
            </Button>
          </div>
        </div>
      )}
      <CameraCapture open={camOpen} initialFacing="user" onClose={() => setCamOpen(false)} onCapture={(f) => void setPhotoFile(f)} />
      <StickerPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={addEmoji} />
    </div>
  );
}

function ToolButton({ icon: Icon, label, onClick }: { icon: typeof Type; label: string; onClick: () => void }) {
  return (
    <button
      onClick={() => {
        haptic('light');
        onClick();
      }}
      className="flex flex-col items-center gap-1 rounded-2xl bg-card px-1 py-2.5 text-center shadow-card transition active:scale-95"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <span className="text-[11px] font-bold leading-tight text-ink">{label}</span>
    </button>
  );
}

function SmallIcon({ icon: Icon, label, onClick, danger }: { icon: typeof Type; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={clsx('flex h-9 w-9 items-center justify-center rounded-xl transition active:scale-95', danger ? 'bg-danger-soft text-danger' : 'bg-surface text-ink')}
    >
      <Icon className="h-[18px] w-[18px]" />
    </button>
  );
}

function SliderRow({
  icon: Icon,
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  icon: typeof Type;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, value))}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
        aria-label={label}
      />
      <span className="w-12 shrink-0 text-right text-[12px] font-semibold text-muted">{display}</span>
    </div>
  );
}

/** Emoji va stikerlar: tayyor to'plamlar + telefon klaviaturasidan istalgan emoji */
function StickerPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (e: string) => void }) {
  const { t } = useTranslation();
  const [group, setGroup] = useState(STICKER_GROUPS[0].key);
  const [custom, setCustom] = useState('');
  useEffect(() => {
    if (open) setCustom('');
  }, [open]);
  const items = STICKER_GROUPS.find((g) => g.key === group)?.items ?? [];
  return (
    <Modal open={open} onClose={onClose} title={t('personal.stickers')}>
      <div className="space-y-3">
        <div className="flex gap-2">
          <input
            className="input flex-1 text-[20px]"
            value={custom}
            maxLength={16}
            placeholder={t('personal.keyboardEmojiPh')}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && custom.trim() && onPick(custom)}
          />
          <Button disabled={!custom.trim()} onClick={() => onPick(custom)}>
            {t('common.add')}
          </Button>
        </div>
        <p className="text-[12px] text-muted">{t('personal.keyboardEmoji')}</p>
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
          {STICKER_GROUPS.map((g) => (
            <button
              key={g.key}
              onClick={() => setGroup(g.key)}
              className={clsx('shrink-0 rounded-full px-3 py-1.5 text-[13px] font-bold', group === g.key ? 'bg-primary text-white' : 'bg-surface text-ink')}
            >
              {g.items[0]} {t(`personal.stickerGroup.${g.key}`)}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
          {items.map((e) => (
            <button key={e} onClick={() => onPick(e)} className="flex aspect-square items-center justify-center rounded-xl bg-surface text-[28px] transition active:scale-90">
              {e}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
