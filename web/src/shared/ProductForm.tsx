import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Camera, ChevronDown, ChevronLeft, ChevronRight, ImagePlus, Languages, Loader2, RefreshCw, Sparkles, Star, Trash2 } from 'lucide-react';
import { get, patch, post, upload } from './api';
import { CameraCapture, cameraSupported } from './CameraCapture';
import type { Category, Product, ProductImage, Unit } from './types';
import { Button, Card, Field, PageLoader, Switch, clsx, useToast } from './ui';
import { nameOf } from './format';

const UNITS: Unit[] = ['PIECE', 'KG', 'GRAM', 'LITER', 'BOX', 'PACK'];
const DEFAULT_STEP: Record<Unit, number> = { PIECE: 1, KG: 0.5, GRAM: 100, LITER: 1, BOX: 1, PACK: 1 };

type FormState = {
  nameUz: string;
  nameRu: string;
  descriptionUz: string;
  descriptionRu: string;
  categoryId: string;
  price: string;
  oldPrice: string;
  unit: Unit;
  step: string;
  minQty: string;
  lowStockThreshold: string;
  initialStock: string;
  isActive: boolean;
};

const emptyForm: FormState = {
  nameUz: '',
  nameRu: '',
  descriptionUz: '',
  descriptionRu: '',
  categoryId: '',
  price: '',
  oldPrice: '',
  unit: 'PIECE',
  step: '1',
  minQty: '1',
  lowStockThreshold: '5',
  initialStock: '',
  isActive: true,
};

const num = (s: string) => Number(String(s).replace(/\s/g, '').replace(',', '.'));

/** Bitta rasm: original va AI variant yonma-yon */
function ImageCard({
  image,
  index,
  total,
  onChange,
  onRemove,
  onMove,
}: {
  image: ProductImage;
  index: number;
  total: number;
  onChange: (img: ProductImage) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const pending = image.aiStatus === 'PENDING' || image.aiStatus === 'PROCESSING';

  // AI tugaguncha so'rab turamiz
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(async () => {
      try {
        const fresh = await get<ProductImage>(`/manage/images/${image.id}`);
        if (fresh.aiStatus !== image.aiStatus || fresh.aiUrl !== image.aiUrl) {
          onChange(fresh);
          if (fresh.aiStatus === 'FAILED') toast.info(t('pf.aiFailed'));
        }
      } catch {
        /* keyingi urinish */
      }
    }, 2500);
    return () => clearInterval(timer);
  }, [pending, image.id, image.aiStatus]);

  const setUseAi = async (useAi: boolean) => {
    try {
      onChange(await patch<ProductImage>(`/manage/images/${image.id}`, { useAi }));
    } catch (e) {
      toast.error(e);
    }
  };
  const regenerate = async () => {
    try {
      onChange(await post<ProductImage>(`/manage/images/${image.id}/regenerate`));
    } catch (e) {
      toast.error(e);
    }
  };

  const aiReady = image.aiStatus === 'DONE' && image.aiThumb;
  const selectedAi = image.useAi && aiReady;

  return (
    <div className="rounded-2xl border border-line p-2.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1 text-[12px] font-bold text-muted">
          #{index + 1}
          {index === 0 && <Star className="h-3.5 w-3.5 fill-accent text-accent" />}
        </span>
        <div className="flex items-center gap-1">
          <button type="button" disabled={index === 0} onClick={() => onMove(-1)} className="rounded-lg p-1.5 text-muted hover:bg-surface disabled:opacity-30" aria-label="left">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" disabled={index === total - 1} onClick={() => onMove(1)} className="rounded-lg p-1.5 text-muted hover:bg-surface disabled:opacity-30" aria-label="right">
            <ChevronRight className="h-4 w-4" />
          </button>
          <button type="button" onClick={onRemove} className="rounded-lg p-1.5 text-danger hover:bg-danger-soft" aria-label={t('pf.remove')}>
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setUseAi(false)} className={clsx('overflow-hidden rounded-xl border-2 text-left', !selectedAi ? 'border-primary' : 'border-transparent')}>
          <img src={image.originalThumb} alt="" className="aspect-square w-full bg-surface object-cover" />
          <div className="flex items-center justify-between px-2 py-1 text-[11px] font-bold">
            <span>{t('pf.original')}</span>
            {!selectedAi && <span className="text-primary">{t('pf.useThis')}</span>}
          </div>
        </button>
        <button type="button" disabled={!aiReady} onClick={() => setUseAi(true)} className={clsx('overflow-hidden rounded-xl border-2 text-left', selectedAi ? 'border-primary' : 'border-transparent')}>
          <div className="flex aspect-square w-full items-center justify-center bg-primary-soft">
            {aiReady ? (
              <img src={image.aiThumb!} alt="" className="h-full w-full object-cover" />
            ) : pending ? (
              <div className="flex flex-col items-center gap-2 px-2 text-center text-[11px] font-semibold text-primary-dark">
                <Loader2 className="h-6 w-6 animate-spin" />
                {t('pf.aiPending')}
              </div>
            ) : (
              <div className="px-2 text-center text-[11px] font-semibold text-danger">{image.aiError ? t('pf.aiFailed') : '—'}</div>
            )}
          </div>
          <div className="flex items-center justify-between px-2 py-1 text-[11px] font-bold">
            <span className="flex items-center gap-1"><Sparkles className="h-3 w-3 text-accent" />{t('pf.ai')}</span>
            {selectedAi && <span className="text-primary">{t('pf.useThis')}</span>}
          </div>
        </button>
      </div>
      {!pending && (
        <button type="button" onClick={regenerate} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-[12px] font-bold text-primary hover:bg-primary-soft">
          <RefreshCw className="h-3.5 w-3.5" /> {t('pf.regenerate')}
        </button>
      )}
    </div>
  );
}

export function ProductForm({ productId, onSaved, onCancel }: { productId?: number; onSaved: (p: Product) => void; onCancel?: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const cats = useQuery({ queryKey: ['manage-categories'], queryFn: () => get<Category[]>('/manage/categories') });
  const existing = useQuery({
    queryKey: ['manage-product', productId],
    queryFn: () => get<Product>(`/manage/products/${productId}`),
    enabled: !!productId,
  });
  const [form, setForm] = useState<FormState>(emptyForm);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [uploading, setUploading] = useState(0);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [ruOpen, setRuOpen] = useState(false);
  const [camOpen, setCamOpen] = useState(false);
  const [ruEdited, setRuEdited] = useState(false);
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const p = existing.data;
    if (!p) return;
    setForm({
      nameUz: p.nameUz,
      nameRu: p.nameRu,
      descriptionUz: p.descriptionUz,
      descriptionRu: p.descriptionRu,
      categoryId: String(p.categoryId),
      price: String(p.price),
      oldPrice: p.oldPrice ? String(p.oldPrice) : '',
      unit: p.unit,
      step: String(p.step),
      minQty: String(p.minQty),
      lowStockThreshold: String(p.lowStockThreshold),
      initialStock: '',
      isActive: p.isActive,
    });
    setImages(p.images);
  }, [existing.data]);

  useEffect(() => {
    if (!productId && !form.categoryId && cats.data?.length) setForm((f) => ({ ...f, categoryId: String(cats.data![0].id) }));
  }, [cats.data]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const onUnit = (u: Unit) => setForm((f) => ({ ...f, unit: u, step: String(DEFAULT_STEP[u]), minQty: String(DEFAULT_STEP[u]) }));

  const onFiles = async (files: FileList | File[] | null) => {
    if (!files?.length) return;
    const list = Array.from(files).slice(0, 5 - images.length);
    if (!list.length) return toast.info(t('pf.maxImages'));
    setUploading((n) => n + list.length);
    for (const f of list) {
      try {
        const img = await upload<ProductImage>('/manage/images', f, 'file');
        setImages((s) => [...s, img].slice(0, 5));
      } catch (e) {
        toast.error(e instanceof Error ? e : new Error(t('pf.uploadFailed')));
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (camRef.current) camRef.current.value = '';
    if (galRef.current) galRef.current.value = '';
  };

  const move = (i: number, dir: -1 | 1) =>
    setImages((s) => {
      const c = [...s];
      const j = i + dir;
      if (j < 0 || j >= c.length) return s;
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.nameUz.trim()) e.nameUz = '!';
    if (!form.categoryId) e.categoryId = '!';
    if (!(num(form.price) >= 0) || form.price === '') e.price = '!';
    if (form.oldPrice && num(form.oldPrice) <= num(form.price)) e.oldPrice = t('pf.oldPriceHint');
    if (!(num(form.step) > 0)) e.step = '!';
    if (!(num(form.minQty) > 0)) e.minQty = '!';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const body = {
        nameUz: form.nameUz.trim(),
        descriptionUz: form.descriptionUz.trim(),
        // Ruscha faqat qo'lda tuzatilgan bo'lsa yuboriladi, aks holda server avtomatik tarjima qiladi
        ...(ruEdited && form.nameRu.trim() ? { nameRu: form.nameRu.trim(), descriptionRu: form.descriptionRu.trim() } : {}),
        categoryId: Number(form.categoryId),
        price: Math.round(num(form.price)),
        oldPrice: form.oldPrice ? Math.round(num(form.oldPrice)) : null,
        unit: form.unit,
        step: num(form.step),
        minQty: num(form.minQty),
        lowStockThreshold: num(form.lowStockThreshold) || 0,
        isActive: form.isActive,
        imageIds: images.map((i) => i.id),
        ...(productId ? {} : form.initialStock ? { initialStock: num(form.initialStock) } : {}),
      };
      const saved = productId ? await patch<Product>(`/manage/products/${productId}`, body) : await post<Product>('/manage/products', body);
      toast.success(t('pf.saved'));
      await qc.invalidateQueries({ queryKey: ['manage-products'] });
      await qc.invalidateQueries({ queryKey: ['manage-product'] });
      onSaved(saved);
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };

  if ((productId && existing.isLoading) || cats.isLoading) return <PageLoader />;

  return (
    <div className="space-y-3 pb-6">
      <CameraCapture open={camOpen} onClose={() => setCamOpen(false)} onCapture={(f) => void onFiles([f])} />
      <Card className="p-4">
        <div className="mb-2 text-[13px] font-bold text-primary-dark">{t('pf.images')}</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {images.map((img, i) => (
            <ImageCard
              key={img.id}
              image={img}
              index={i}
              total={images.length}
              onChange={(n) => setImages((s) => s.map((x) => (x.id === n.id ? n : x)))}
              onRemove={() => setImages((s) => s.filter((x) => x.id !== img.id))}
              onMove={(d) => move(i, d)}
            />
          ))}
          {Array.from({ length: uploading }).map((_, i) => (
            <div key={'u' + i} className="flex aspect-[2/1.2] items-center justify-center rounded-2xl border border-dashed border-line">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ))}
        </div>
        {images.length + uploading < 5 && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFiles(e.target.files)} />
            <input ref={galRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
            <Button type="button" variant="secondary" icon={Camera} onClick={() => (cameraSupported() ? setCamOpen(true) : camRef.current?.click())}>
              {t('pf.takePhoto')}
            </Button>
            <Button type="button" variant="outline" icon={ImagePlus} onClick={() => galRef.current?.click()}>{t('pf.gallery')}</Button>
          </div>
        )}
      </Card>

      <Card className="space-y-3 p-4">
        <Field label={t('pf.nameUz')} error={errors.nameUz}>
          <input className="input" value={form.nameUz} onChange={(e) => set('nameUz', e.target.value)} maxLength={200} />
        </Field>
        <Field label={t('pf.descUz')}>
          <textarea className="input min-h-[80px]" value={form.descriptionUz} onChange={(e) => set('descriptionUz', e.target.value)} />
        </Field>
        <div className="rounded-xl bg-surface">
          <button type="button" onClick={() => setRuOpen((v) => !v)} className="flex w-full items-center justify-between px-3 py-2.5 text-left text-[13px] font-semibold text-primary-dark">
            <span className="flex items-center gap-1.5">
              <Languages className="h-4 w-4 text-primary-light" />
              {t('pf.ruSection')}
            </span>
            <ChevronDown className={clsx('h-4 w-4 transition', ruOpen && 'rotate-180')} />
          </button>
          {ruOpen && (
            <div className="space-y-2.5 px-3 pb-3">
              <p className="text-[12px] text-muted">{t('pf.ruHint')}</p>
              <Field label={t('pf.nameRu')}>
                <input
                  className="input"
                  value={form.nameRu}
                  placeholder={t('pf.ruAuto')}
                  onChange={(e) => {
                    set('nameRu', e.target.value);
                    setRuEdited(true);
                  }}
                  maxLength={200}
                />
              </Field>
              <Field label={t('pf.descRu')}>
                <textarea
                  className="input min-h-[70px]"
                  value={form.descriptionRu}
                  placeholder={t('pf.ruAuto')}
                  onChange={(e) => {
                    set('descriptionRu', e.target.value);
                    setRuEdited(true);
                  }}
                />
              </Field>
            </div>
          )}
        </div>
        <Field label={t('pf.category')} error={errors.categoryId}>
          <select className="input" value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
            {cats.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {nameOf(c)}{!c.isActive ? ` (${t('common.inactive')})` : ''}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('pf.price')} error={errors.price}>
            <input className="input" inputMode="numeric" value={form.price} onChange={(e) => set('price', e.target.value.replace(/[^\d]/g, ''))} />
          </Field>
          <Field label={t('pf.oldPrice')} error={errors.oldPrice}>
            <input className="input" inputMode="numeric" value={form.oldPrice} onChange={(e) => set('oldPrice', e.target.value.replace(/[^\d]/g, ''))} />
          </Field>
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <Field label={t('pf.unit')}>
          <div className="grid grid-cols-3 gap-2">
            {UNITS.map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => onUnit(u)}
                className={clsx('rounded-xl border py-2 text-[13px] font-semibold', form.unit === u ? 'border-primary bg-primary text-white' : 'border-line bg-card text-ink')}
              >
                {t(`unit.${u}`)}
              </button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('pf.step')} hint={t('pf.stepHint')} error={errors.step}>
            <input className="input" inputMode="decimal" value={form.step} onChange={(e) => set('step', e.target.value.replace(/[^\d.,]/g, ''))} />
          </Field>
          <Field label={t('pf.minQty')} error={errors.minQty}>
            <input className="input" inputMode="decimal" value={form.minQty} onChange={(e) => set('minQty', e.target.value.replace(/[^\d.,]/g, ''))} />
          </Field>
          <Field label={t('pf.lowThreshold')}>
            <input className="input" inputMode="decimal" value={form.lowStockThreshold} onChange={(e) => set('lowStockThreshold', e.target.value.replace(/[^\d.,]/g, ''))} />
          </Field>
          {!productId && (
            <Field label={t('pf.initialStock')}>
              <input className="input" inputMode="decimal" value={form.initialStock} onChange={(e) => set('initialStock', e.target.value.replace(/[^\d.,]/g, ''))} />
            </Field>
          )}
        </div>
        <Switch checked={form.isActive} onChange={(v) => set('isActive', v)} label={t('pf.isActive')} />
      </Card>

      <div className="flex gap-2">
        {onCancel && (
          <Button variant="outline" block onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        )}
        <Button block size="lg" loading={saving} disabled={uploading > 0} onClick={save}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}
