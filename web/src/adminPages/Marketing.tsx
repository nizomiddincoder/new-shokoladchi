import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ImagePlus, Loader2, Megaphone, Pencil, Plus, RefreshCw, Send, Sparkles, Trash2, X } from 'lucide-react';
import { del, get, patch, post, upload } from '../shared/api';
import type { Banner, Category, Paged, Product } from '../shared/types';
import { Badge, Button, Card, ConfirmModal, Empty, Field, Modal, Segmented, Switch, useToast } from '../shared/ui';
import { OrdersListSkeleton } from '../shared/staffParts';
import { dateTime, nameOf } from '../shared/format';
import { AdminPage } from './common';

type Segment = 'ALL' | 'ACTIVE_30' | 'INACTIVE_30' | 'NO_ORDERS';
type Broadcast = {
  id: number;
  text: string;
  imageUrl: string | null;
  segment: Segment;
  status: 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED';
  total: number;
  sent: number;
  blocked: number;
  failed: number;
  createdAt: string;
  createdBy: string;
};

function ImagePicker({ value, onChange, folder }: { value: string | null; onChange: (url: string | null) => void; folder: 'banners' | 'broadcasts' }) {
  const { t } = useTranslation();
  const toast = useToast();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const onFile = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try {
      const r = await upload<{ url: string }>(`/admin/uploads?folder=${folder}`, f);
      onChange(r.url);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = '';
    }
  };
  return (
    <div>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      {value ? (
        <div className="relative overflow-hidden rounded-2xl border border-line">
          <img src={value} alt="" className="max-h-56 w-full object-cover" />
          <button type="button" onClick={() => onChange(null)} className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5 shadow" aria-label="remove">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <Button type="button" variant="outline" icon={ImagePlus} loading={busy} onClick={() => ref.current?.click()}>
          {t('admin.uploadImage')}
        </Button>
      )}
    </div>
  );
}

export function BroadcastPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['broadcasts'],
    queryFn: () => get<{ items: Broadcast[]; segments: Record<Segment, number> }>('/admin/broadcasts'),
    refetchInterval: (query) => (query.state.data?.items.some((b) => b.status === 'RUNNING' || b.status === 'QUEUED') ? 3000 : false),
  });
  const [text, setText] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [segment, setSegment] = useState<Segment>('ALL');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const count = q.data?.segments[segment] ?? 0;

  const send = async () => {
    setBusy(true);
    try {
      await post('/admin/broadcasts', { text: text.trim(), imageUrl, segment });
      toast.success(t('admin.bcQueued'));
      setText('');
      setImageUrl(null);
      setConfirm(false);
      await qc.invalidateQueries({ queryKey: ['broadcasts'] });
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminPage title={t('admin.broadcast')}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="space-y-3 p-4">
          <Field label={t('admin.segment')}>
            <select className="input" value={segment} onChange={(e) => setSegment(e.target.value as Segment)}>
              {(['ALL', 'ACTIVE_30', 'INACTIVE_30', 'NO_ORDERS'] as Segment[]).map((s) => (
                <option key={s} value={s}>
                  {t(`admin.segments.${s}`)} ({q.data?.segments[s] ?? '…'})
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('admin.bcText')} hint={t('admin.bcButtonNote')}>
            <textarea className="input min-h-[140px]" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} />
          </Field>
          <Field label={t('admin.bcImage')}>
            <ImagePicker value={imageUrl} onChange={setImageUrl} folder="broadcasts" />
          </Field>
          <Button block icon={Send} disabled={!text.trim() || !count} onClick={() => setConfirm(true)}>
            {t('admin.bcSend')} ({count})
          </Button>
        </Card>
        <div>
          <h3 className="mb-2 text-[15px] font-bold">{t('admin.bcHistory')}</h3>
          {q.isLoading && <OrdersListSkeleton />}
          {q.data?.items.length === 0 && <Empty icon={Megaphone} title={t('common.empty')} />}
          <div className="space-y-2">
            {q.data?.items.map((b) => (
              <Card key={b.id} className="p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[12px] text-muted">
                    {dateTime(b.createdAt)} · {t(`admin.segments.${b.segment}`)}
                  </div>
                  <Badge tone={b.status === 'DONE' ? 'success' : b.status === 'FAILED' ? 'danger' : 'warning'}>{t(`admin.bcStatus.${b.status}`)}</Badge>
                </div>
                <div className="mt-1.5 line-clamp-3 whitespace-pre-line text-[14px]" dangerouslySetInnerHTML={{ __html: b.text }} />
                <div className="mt-2 flex flex-wrap gap-3 text-[12px] font-semibold">
                  <span className="text-success">{t('admin.bcSent')}: {b.sent}/{b.total}</span>
                  <span className="text-danger">{t('admin.bcBlocked')}: {b.blocked}</span>
                  {b.failed > 0 && <span className="text-muted">{t('admin.bcFailed')}: {b.failed}</span>}
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
      <ConfirmModal open={confirm} onClose={() => setConfirm(false)} onConfirm={send} loading={busy} title={t('admin.bcConfirm', { count })} text={text.slice(0, 200)} />
    </AdminPage>
  );
}

// ================= BANNERLAR =================

/** AI banner: rasmlar + tavsif -> Gemini tayyor banner yasaydi */
function AiBannerBuilder({ value, onChange }: { value: string | null; onChange: (url: string) => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const ref = useRef<HTMLInputElement>(null);
  const [sources, setSources] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [description, setDescription] = useState('');
  const [headline, setHeadline] = useState('');
  const [busy, setBusy] = useState(false);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const f of Array.from(files).slice(0, 4 - sources.length)) {
        const r = await upload<{ url: string }>('/admin/uploads?folder=banners', f);
        setSources((s) => [...s, r.url].slice(0, 4));
      }
    } catch (e) {
      toast.error(e);
    } finally {
      setUploading(false);
      if (ref.current) ref.current.value = '';
    }
  };

  const generate = async () => {
    setBusy(true);
    try {
      const r = await post<{ url: string }>('/admin/banners/ai', { description: description.trim(), headline: headline.trim() || undefined, imageUrls: sources });
      onChange(r.url);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <Field label={t('admin.bnSources')}>
        <div className="flex flex-wrap gap-2">
          {sources.map((u) => (
            <div key={u} className="relative h-20 w-20 overflow-hidden rounded-xl border border-line">
              <img src={u} alt="" className="h-full w-full object-cover" />
              <button type="button" onClick={() => setSources((s) => s.filter((x) => x !== u))} className="absolute right-1 top-1 rounded-full bg-white/90 p-1 shadow" aria-label="remove">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {sources.length < 4 && (
            <button
              type="button"
              onClick={() => ref.current?.click()}
              className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-primary-light text-[11px] font-semibold text-primary"
            >
              {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
              {t('admin.bnAddSource')}
            </button>
          )}
          <input ref={ref} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
        </div>
      </Field>
      <Field label={t('admin.bnDescription')}>
        <textarea className="input min-h-[84px]" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('admin.bnDescriptionPh')} maxLength={1000} />
      </Field>
      <Field label={t('admin.bnHeadline')} hint={t('admin.bnHeadlineHint')}>
        <input className="input" value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder={t('admin.bnHeadlinePh')} maxLength={80} />
      </Field>
      <Button block variant={value ? 'secondary' : 'primary'} icon={value ? RefreshCw : Sparkles} loading={busy} disabled={description.trim().length < 3 || uploading} onClick={generate}>
        {value ? t('admin.bnRegenerate') : t('admin.bnGenerate')}
      </Button>
      {busy && <p className="text-center text-[12px] text-muted">{t('admin.bnGenerating')}</p>}
      {value && !busy && (
        <div>
          <div className="mb-1.5 text-[13px] font-semibold text-primary-dark">{t('admin.bnResult')}</div>
          <img src={value} alt="" className="aspect-[2.2/1] w-full rounded-2xl border border-line object-cover" />
        </div>
      )}
    </div>
  );
}
type BannerForm = Omit<Banner, 'id'> & { id?: number };
const emptyBanner: BannerForm = { imageUrl: '', titleUz: '', titleRu: '', linkType: 'NONE', linkId: null, sortOrder: 0, isActive: true };

export function BannersPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-banners'], queryFn: () => get<Banner[]>('/admin/banners') });
  const cats = useQuery({ queryKey: ['manage-categories'], queryFn: () => get<Category[]>('/manage/categories') });
  const products = useQuery({ queryKey: ['manage-products', 'banner-pick'], queryFn: () => get<Paged<Product>>('/manage/products?limit=500&status=active&sort=name') });
  const [form, setForm] = useState<BannerForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<Banner | null>(null);
  const [bannerMode, setBannerMode] = useState<'ai' | 'upload'>('ai');

  const save = async () => {
    if (!form) return;
    setBusy(true);
    try {
      // titleRu yuborilmaydi: server o'zbekchadan avtomatik tarjima qiladi
      const { id, titleRu, ...body } = form;
      void titleRu;
      const payload = { ...body, linkId: body.linkType === 'NONE' ? null : body.linkId };
      if (id) await patch(`/admin/banners/${id}`, payload);
      else await post('/admin/banners', payload);
      setForm(null);
      toast.success(t('common.saved'));
      await qc.invalidateQueries({ queryKey: ['admin-banners'] });
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!toDelete) return;
    try {
      await del(`/admin/banners/${toDelete.id}`);
      setToDelete(null);
      await qc.invalidateQueries({ queryKey: ['admin-banners'] });
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <AdminPage
      title={t('admin.banners')}
      actions={
        <Button
          size="sm"
          icon={Plus}
          onClick={() => {
            setBannerMode('ai');
            setForm({ ...emptyBanner, sortOrder: q.data?.length || 0 });
          }}
        >
          {t('common.add')}
        </Button>
      }
    >
      {q.isLoading && <OrdersListSkeleton />}
      {q.data?.length === 0 && <Empty icon={ImagePlus} title={t('common.empty')} />}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {q.data?.map((b) => (
          <Card key={b.id} className="overflow-hidden">
            <img src={b.imageUrl} alt="" className="aspect-[2.2/1] w-full bg-surface object-cover" />
            <div className="flex items-center gap-2 p-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{b.titleUz || '—'}</div>
                <div className="text-[12px] text-muted">
                  {t(`admin.link.${b.linkType}`)} · #{b.sortOrder} {!b.isActive && <Badge tone="muted">{t('common.inactive')}</Badge>}
                </div>
              </div>
              <button className="rounded-lg p-1.5 text-primary hover:bg-surface" onClick={() => { setBannerMode('upload'); setForm({ ...b }); }} aria-label={t('common.edit')}><Pencil className="h-4 w-4" /></button>
              <button className="rounded-lg p-1.5 text-danger hover:bg-[#FBEAE8]" onClick={() => setToDelete(b)} aria-label={t('common.delete')}><Trash2 className="h-4 w-4" /></button>
            </div>
          </Card>
        ))}
      </div>
      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? t('admin.banner') : t('admin.newBanner')}
        wide
        footer={
          <div className="pb-2">
            <Button block loading={busy} disabled={!form?.imageUrl} onClick={save}>{t('common.save')}</Button>
          </div>
        }
      >
        {form && (
          <div className="space-y-3">
            <Segmented
              value={bannerMode}
              onChange={setBannerMode}
              items={[
                { value: 'ai', label: t('admin.bnModeAi'), icon: Sparkles },
                { value: 'upload', label: t('admin.bnModeUpload'), icon: ImagePlus },
              ]}
            />
            {bannerMode === 'ai' ? (
              <AiBannerBuilder value={form.imageUrl || null} onChange={(url) => setForm({ ...form, imageUrl: url })} />
            ) : (
              <ImagePicker value={form.imageUrl || null} onChange={(url) => setForm({ ...form, imageUrl: url || '' })} folder="banners" />
            )}
            <Field label={t('admin.titleUz')}>
              <input className="input" value={form.titleUz} onChange={(e) => setForm({ ...form, titleUz: e.target.value })} maxLength={120} />
            </Field>
            <Field label={t('admin.linkType')}>
              <select className="input" value={form.linkType} onChange={(e) => setForm({ ...form, linkType: e.target.value as Banner['linkType'], linkId: null })}>
                {(['NONE', 'CATEGORY', 'PRODUCT'] as const).map((l) => (
                  <option key={l} value={l}>{t(`admin.link.${l}`)}</option>
                ))}
              </select>
            </Field>
            {form.linkType === 'CATEGORY' && (
              <select className="input" value={form.linkId ?? ''} onChange={(e) => setForm({ ...form, linkId: Number(e.target.value) || null })}>
                <option value="">—</option>
                {cats.data?.map((c) => (
                  <option key={c.id} value={c.id}>{nameOf(c)}</option>
                ))}
              </select>
            )}
            {form.linkType === 'PRODUCT' && (
              <select className="input" value={form.linkId ?? ''} onChange={(e) => setForm({ ...form, linkId: Number(e.target.value) || null })}>
                <option value="">—</option>
                {products.data?.items.map((p) => (
                  <option key={p.id} value={p.id}>{nameOf(p)}</option>
                ))}
              </select>
            )}
            <Field label={t('admin.sortOrder')}>
              <input className="input" inputMode="numeric" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
            </Field>
            <Switch checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} label={t('common.active')} />
          </div>
        )}
      </Modal>
      <ConfirmModal open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={remove} danger title={t('common.delete')} />
    </AdminPage>
  );
}
