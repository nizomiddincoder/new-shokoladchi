import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Gift, ImagePlus, PanelRight, Pencil, Plus, Trash2, UserRound } from 'lucide-react';
import { del, get, patch, post, upload } from '../shared/api';
import type { Paged, Product } from '../shared/types';
import { Badge, Button, Card, ConfirmModal, Empty, Field, Modal, Switch, useToast } from '../shared/ui';
import { OrdersListSkeleton } from '../shared/staffParts';
import { loadImage, makeDesign, renderDesign } from '../shared/personalRender';
import { money, nameOf } from '../shared/format';
import { AdminPage } from './common';

type Tpl = {
  id: number;
  titleUz: string;
  titleRu: string;
  imageUrl: string;
  width: number;
  height: number;
  areaX: number;
  areaY: number;
  areaW: number;
  areaH: number;
  productId: number;
  sortOrder: number;
  isActive: boolean;
  product?: { id: number; nameUz: string; nameRu: string; price: number; isActive: boolean };
};
type TplForm = Omit<Tpl, 'id' | 'titleRu' | 'product'> & { id?: number };

/** Mijoz rasmi uchun standart joy: qadoqning o'ng tarafidagi bo'sh maydon */
const RIGHT_AREA = { areaX: 0.67, areaY: 0.05, areaW: 0.31, areaH: 0.45 };

function AreaPreview({ form, testPhoto }: { form: TplForm; testPhoto: HTMLImageElement | null }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    setImg(null);
    if (form.imageUrl) void loadImage(form.imageUrl).then(setImg).catch(() => setImg(null));
  }, [form.imageUrl]);
  useEffect(() => {
    const c = ref.current;
    if (!c || !img) return;
    const w = c.parentElement!.clientWidth;
    const scale = (w / form.width) * Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(form.width * scale);
    c.height = Math.round(form.height * scale);
    c.style.width = `${w}px`;
    const ctx = c.getContext('2d')!;
    const d = makeDesign(form, form.width, form.height, testPhoto, testPhoto ? 'Tabriklaymiz!' : '');
    renderDesign(ctx, img, form.width, form.height, form, d, scale, { placeholder: t('personal.placeholder') });
    // Joy chegarasi
    ctx.save();
    ctx.scale(scale, scale);
    ctx.strokeStyle = '#C0392B';
    ctx.lineWidth = Math.max(2, form.width * 0.003);
    ctx.setLineDash([form.width * 0.01, form.width * 0.006]);
    ctx.strokeRect(form.areaX * form.width, form.areaY * form.height, form.areaW * form.width, form.areaH * form.height);
    ctx.restore();
  }, [img, form, testPhoto]);
  if (!form.imageUrl) return null;
  return (
    <div className="w-full overflow-hidden rounded-xl border border-line bg-white">
      <canvas ref={ref} className="block" />
    </div>
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-3 text-[13px]">
      <span className="w-20 shrink-0 font-semibold text-muted">{label}</span>
      <input type="range" min={0} max={100} step={0.5} value={Math.round(value * 1000) / 10} onChange={(e) => onChange(Number(e.target.value) / 100)} className="w-full accent-primary" />
      <span className="w-12 shrink-0 text-right font-bold">{Math.round(value * 100)}%</span>
    </label>
  );
}

export function TemplatesPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-templates'], queryFn: () => get<Tpl[]>('/admin/personal-templates') });
  const products = useQuery({ queryKey: ['manage-products', 'tpl-pick'], queryFn: () => get<Paged<Product>>('/manage/products?limit=500&sort=name') });
  const [form, setForm] = useState<TplForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toDelete, setToDelete] = useState<Tpl | null>(null);
  const [testPhoto, setTestPhoto] = useState<HTMLImageElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const testRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['admin-templates'] });
    await qc.invalidateQueries({ queryKey: ['personal-templates'] });
    await qc.invalidateQueries({ queryKey: ['home'] });
  };

  const onTemplateFile = async (f?: File) => {
    if (!f) return;
    setUploading(true);
    try {
      const r = await upload<{ url: string; width: number; height: number }>('/admin/uploads?folder=templates', f);
      setForm((x) => (x ? { ...x, imageUrl: r.url, width: r.width, height: r.height } : x));
    } catch (e) {
      toast.error(e);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onTestFile = async (f?: File) => {
    if (!f) return;
    try {
      setTestPhoto(await loadImage(URL.createObjectURL(f)));
    } catch (e) {
      toast.error(e);
    }
  };

  const save = async () => {
    if (!form) return;
    setBusy(true);
    try {
      const { id, ...body } = form;
      if (id) await patch(`/admin/personal-templates/${id}`, body);
      else await post('/admin/personal-templates', body);
      toast.success(t('common.saved'));
      setForm(null);
      await refresh();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    try {
      await del(`/admin/personal-templates/${toDelete.id}`);
      setToDelete(null);
      await refresh();
    } catch (e) {
      toast.error(e);
    }
  };

  const setArea = (k: 'areaX' | 'areaY' | 'areaW' | 'areaH', v: number) =>
    setForm((x) => {
      if (!x) return x;
      const n = { ...x, [k]: v };
      // Chegaradan chiqmasin
      if (n.areaX + n.areaW > 1) k === 'areaX' ? (n.areaX = 1 - n.areaW) : (n.areaW = 1 - n.areaX);
      if (n.areaY + n.areaH > 1) k === 'areaY' ? (n.areaY = 1 - n.areaH) : (n.areaH = 1 - n.areaY);
      n.areaW = Math.max(0.05, n.areaW);
      n.areaH = Math.max(0.05, n.areaH);
      return n;
    });

  const newForm = (): TplForm => ({
    titleUz: '',
    imageUrl: '',
    width: 0,
    height: 0,
    ...RIGHT_AREA,
    productId: products.data?.items[0]?.id ?? 0,
    sortOrder: q.data?.length ?? 0,
    isActive: true,
  });

  return (
    <AdminPage title={t('admin.templates')} actions={<Button size="sm" icon={Plus} onClick={() => setForm(newForm())}>{t('common.add')}</Button>}>
      {q.isLoading && <OrdersListSkeleton />}
      {q.data?.length === 0 && <Empty icon={Gift} title={t('personal.noTemplates')} />}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {q.data?.map((tp) => (
          <Card key={tp.id} className="overflow-hidden">
            <img src={tp.imageUrl} alt="" className="aspect-[1.8/1] w-full bg-white object-contain" />
            <div className="flex items-center gap-2 p-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{tp.titleUz}</div>
                <div className="truncate text-[12px] text-muted">
                  {tp.product ? `${nameOf(tp.product)} · ${money(tp.product.price)}` : '—'}
                  {!tp.isActive && <Badge tone="muted" className="ml-1.5">{t('common.inactive')}</Badge>}
                </div>
              </div>
              <button
                className="rounded-lg p-1.5 text-primary hover:bg-surface"
                onClick={() => {
                  const { titleRu, product, ...rest } = tp;
                  void titleRu;
                  void product;
                  setForm(rest);
                }}
                aria-label={t('common.edit')}
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button className="rounded-lg p-1.5 text-danger hover:bg-danger-soft" onClick={() => setToDelete(tp)} aria-label={t('common.delete')}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </Card>
        ))}
      </div>

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        wide
        title={form?.id ? t('common.edit') : t('admin.newTemplate')}
        footer={
          <div className="pb-2">
            <Button block loading={busy} disabled={!form?.titleUz.trim() || !form?.imageUrl || !form?.productId || uploading} onClick={save}>
              {t('common.save')}
            </Button>
          </div>
        }
      >
        {form && (
          <div className="space-y-4">
            <Field label={t('admin.tplTitle')}>
              <input className="input" value={form.titleUz} onChange={(e) => setForm({ ...form, titleUz: e.target.value })} maxLength={120} placeholder="Kinder Chocolate — sizning rasmingiz bilan" />
            </Field>
            <Field label={t('admin.tplImage')} hint={t('admin.tplImageHint')}>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onTemplateFile(e.target.files?.[0])} />
              <Button type="button" variant="outline" icon={ImagePlus} loading={uploading} onClick={() => fileRef.current?.click()}>
                {t('admin.uploadImage')}
              </Button>
            </Field>
            {form.imageUrl && (
              <div className="space-y-3 rounded-2xl bg-surface p-3">
                <div>
                  <div className="text-[13px] font-bold text-primary-dark">{t('admin.tplArea')}</div>
                  <div className="text-[12px] text-muted">{t('admin.tplAreaHint')}</div>
                </div>
                <AreaPreview form={form} testPhoto={testPhoto} />
                <Slider label={t('admin.tplX')} value={form.areaX} onChange={(v) => setArea('areaX', v)} />
                <Slider label={t('admin.tplY')} value={form.areaY} onChange={(v) => setArea('areaY', v)} />
                <Slider label={t('admin.tplW')} value={form.areaW} onChange={(v) => setArea('areaW', v)} />
                <Slider label={t('admin.tplH')} value={form.areaH} onChange={(v) => setArea('areaH', v)} />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="secondary" icon={PanelRight} onClick={() => setForm({ ...form, ...RIGHT_AREA })}>
                    {t('admin.tplRight')}
                  </Button>
                  <input ref={testRef} type="file" accept="image/*" className="hidden" onChange={(e) => onTestFile(e.target.files?.[0])} />
                  <Button type="button" size="sm" variant="outline" icon={UserRound} onClick={() => testRef.current?.click()}>
                    {t('admin.tplTest')}
                  </Button>
                </div>
              </div>
            )}
            <Field label={t('admin.tplProduct')}>
              <select className="input" value={form.productId || ''} onChange={(e) => setForm({ ...form, productId: Number(e.target.value) })}>
                <option value="">—</option>
                {products.data?.items.map((p) => (
                  <option key={p.id} value={p.id}>
                    {nameOf(p)} · {money(p.price)}
                  </option>
                ))}
              </select>
            </Field>
            <Switch checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} label={t('common.active')} />
          </div>
        )}
      </Modal>
      <ConfirmModal open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={remove} danger title={`${t('common.delete')}: ${toDelete?.titleUz || ''}`} />
    </AdminPage>
  );
}
