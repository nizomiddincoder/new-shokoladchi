import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Camera, Gift, ImagePlus, RotateCcw, ShoppingBag, Type, ZoomIn } from 'lucide-react';
import { get, upload } from '../../shared/api';
import type { PersonalTemplate } from '../../shared/types';
import { Button, Card, Empty, ErrorState, Field, PageLoader, Segmented, Stepper, clsx, useToast } from '../../shared/ui';
import { CameraCapture, cameraSupported } from '../../shared/CameraCapture';
import { TEXT_COLORS, areaPx, ensureFonts, exportDesign, loadImage, photoRect, renderDesign, type DesignState } from '../../shared/personalRender';
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

const initialDesign: DesignState = { photo: null, zoom: 1, offX: 0, offY: 0, text: '', textColor: '#FFFFFF', textSize: 'M', textPos: 'bottom' };

export function PersonalPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const q = useQuery({ queryKey: ['personal-templates'], queryFn: () => get<PersonalTemplate[]>('/catalog/personal-templates') });
  const [tplId, setTplId] = useState<number | null>(null);
  const [tplImg, setTplImg] = useState<HTMLImageElement | null>(null);
  const [d, setD] = useState<DesignState>(initialDesign);
  const [qty, setQty] = useState(1);
  const [camOpen, setCamOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [width, setWidth] = useState(360);

  const tpl = q.data?.find((x) => x.id === tplId) ?? q.data?.[0] ?? null;
  const title = tpl ? (i18n.language === 'ru' && tpl.titleRu ? tpl.titleRu : tpl.titleUz) : '';

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
    c.width = Math.round(tpl.width * scale);
    c.height = Math.round(tpl.height * scale);
    c.style.width = `${width}px`;
    c.style.height = `${(width * tpl.height) / tpl.width}px`;
    const ctx = c.getContext('2d')!;
    let cancelled = false;
    void ensureFonts().then(() => {
      if (!cancelled) renderDesign(ctx, tplImg, tpl.width, tpl.height, tpl, d, scale, t('personal.placeholder'));
    });
    return () => {
      cancelled = true;
    };
  }, [tpl, tplImg, d, width]);

  const setPhotoFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const url = URL.createObjectURL(file);
      const img = await loadImage(url);
      setD((x) => ({ ...x, photo: img, zoom: 1, offX: 0, offY: 0 }));
      haptic('success');
    } catch (e) {
      toast.error(e);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // Rasmni barmoq/sichqoncha bilan surish
  const onPointerDown = (e: React.PointerEvent) => {
    if (!d.photo) return;
    drag.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || !d.photo || !tpl) return;
    const k = tpl.width / width; // ekran pikseli -> shablon pikseli
    const dx = (e.clientX - drag.current.x) * k;
    const dy = (e.clientY - drag.current.y) * k;
    drag.current = { x: e.clientX, y: e.clientY };
    const a = areaPx(tpl, tpl.width, tpl.height);
    const r = photoRect(d.photo, a, d.zoom, d.offX, d.offY);
    const clamp = (v: number) => Math.max(-0.5, Math.min(0.5, v));
    setD((x) => ({
      ...x,
      offX: r.ox > 0 ? clamp(x.offX - dx / r.ox) : 0,
      offY: r.oy > 0 ? clamp(x.offY - dy / r.oy) : 0,
    }));
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const order = async () => {
    if (!tpl || !tplImg) return;
    if (!d.photo) {
      toast.error(new Error(t('personal.needPhoto')));
      return;
    }
    setBusy(true);
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

          {/* Oldindan ko'rish */}
          <Card className="overflow-hidden p-2">
            <div ref={wrapRef} className="w-full">
              {tplImg ? (
                <canvas
                  ref={canvasRef}
                  className={clsx('block touch-none rounded-xl', d.photo && 'cursor-grab active:cursor-grabbing')}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                />
              ) : (
                <div className="skeleton aspect-[1.8/1] w-full rounded-xl" />
              )}
            </div>
            {d.photo && <div className="px-2 pb-1 pt-2 text-center text-[12px] text-muted">{t('personal.dragHint')}</div>}
          </Card>

          {/* Rasm */}
          <Card className="space-y-3 p-4">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => setPhotoFile(e.target.files?.[0])} />
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" icon={ImagePlus} onClick={() => fileRef.current?.click()}>
                {t('personal.upload')}
              </Button>
              <Button variant="secondary" icon={Camera} onClick={() => (cameraSupported() ? setCamOpen(true) : fileRef.current?.click())}>
                {t('personal.selfie')}
              </Button>
            </div>
            {d.photo && (
              <div className="flex items-center gap-3">
                <ZoomIn className="h-5 w-5 shrink-0 text-primary" />
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={d.zoom}
                  onChange={(e) => setD((x) => ({ ...x, zoom: Number(e.target.value) }))}
                  className="w-full accent-primary"
                  aria-label={t('personal.zoom')}
                />
                <button onClick={() => setD((x) => ({ ...x, zoom: 1, offX: 0, offY: 0 }))} className="rounded-lg p-1.5 text-muted" aria-label={t('personal.reset')}>
                  <RotateCcw className="h-4 w-4" />
                </button>
              </div>
            )}
          </Card>

          {/* Matn */}
          <Card className="space-y-3 p-4">
            <Field label={t('personal.text')}>
              <div className="relative">
                <Type className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input className="input pl-9" maxLength={40} value={d.text} placeholder={t('personal.textPh')} onChange={(e) => setD((x) => ({ ...x, text: e.target.value }))} />
              </div>
            </Field>
            {d.text.trim() && (
              <>
                <div className="flex items-center gap-2">
                  {TEXT_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setD((x) => ({ ...x, textColor: c }))}
                      className={clsx('h-8 w-8 rounded-full border-2', d.textColor === c ? 'border-primary ring-2 ring-primary-soft' : 'border-line')}
                      style={{ background: c }}
                      aria-label={c}
                    />
                  ))}
                </div>
                <Segmented
                  value={d.textSize}
                  onChange={(v) => setD((x) => ({ ...x, textSize: v }))}
                  items={[
                    { value: 'S', label: 'A' },
                    { value: 'M', label: 'A+' },
                    { value: 'L', label: 'A++' },
                  ]}
                />
                <Segmented
                  value={d.textPos}
                  onChange={(v) => setD((x) => ({ ...x, textPos: v }))}
                  items={[
                    { value: 'top', label: t('personal.posTop') },
                    { value: 'bottom', label: t('personal.posBottom') },
                  ]}
                />
              </>
            )}
          </Card>

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
            <Button block size="lg" icon={ShoppingBag} loading={busy} disabled={!tpl.product.inStock} onClick={order}>
              {tpl.product.inStock ? t('personal.order') : t('product.outOfStock')}
            </Button>
          </div>
        </div>
      )}
      <CameraCapture open={camOpen} initialFacing="user" onClose={() => setCamOpen(false)} onCapture={(f) => void setPhotoFile(f)} />
    </div>
  );
}
