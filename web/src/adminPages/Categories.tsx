import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, ImagePlus, Loader2, Pencil, Plus, Sparkles, Trash2, Wand2, X } from 'lucide-react';
import { del, get, patch, post, upload } from '../shared/api';
import type { Category } from '../shared/types';
import { Badge, Button, Card, ConfirmModal, ErrorState, Field, Modal, Switch, clsx, useToast } from '../shared/ui';
import { OrdersListSkeleton } from '../shared/staffParts';
import { CATEGORY_ICONS, CategoryIcon, CategoryVisual } from '../shared/icons';
import { AdminPage } from './common';

type CatForm = { id?: number; nameUz: string; nameRu: string; iconName: string; imageUrl: string | null; origImageUrl: string | null; isActive: boolean };

const busyStatus = (c: Category) => c.imageStatus === 'PENDING' || c.imageStatus === 'PROCESSING';

export function CategoriesPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => get<Category[]>('/admin/categories'),
    // AI rasm tayyorlanayotgan bo'lsa ro'yxatni yangilab turamiz
    refetchInterval: (query) => (query.state.data?.some(busyStatus) ? 3000 : false),
  });
  const [form, setForm] = useState<CatForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toDelete, setToDelete] = useState<Category | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['admin-categories'] });
    await qc.invalidateQueries({ queryKey: ['manage-categories'] });
    await qc.invalidateQueries({ queryKey: ['categories'] });
    await qc.invalidateQueries({ queryKey: ['home'] });
  };

  const save = async () => {
    if (!form) return;
    setBusy(true);
    try {
      // Ruscha nom va (rasm bo'lmasa) rasm server tomonida avtomatik yaratiladi
      const body: Record<string, unknown> = { nameUz: form.nameUz.trim(), iconName: form.iconName, isActive: form.isActive };
      if (!form.id || form.imageUrl !== form.origImageUrl) body.imageUrl = form.imageUrl;
      if (form.id) await patch(`/admin/categories/${form.id}`, body);
      else await post('/admin/categories', { ...body, sortOrder: (q.data?.length || 0) + 1 });
      toast.success(t('common.saved'));
      setForm(null);
      await refresh();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (f?: File) => {
    if (!f || !form) return;
    setUploading(true);
    try {
      const r = await upload<{ url: string }>('/admin/uploads?folder=categories', f);
      setForm((x) => (x ? { ...x, imageUrl: r.url } : x));
    } catch (e) {
      toast.error(e);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const aiImage = async (c: Category) => {
    try {
      await post(`/admin/categories/${c.id}/ai-image`);
      toast.info(t('admin.catAiStarted'));
      await refresh();
    } catch (e) {
      toast.error(e);
    }
  };

  const move = async (i: number, dir: -1 | 1) => {
    const list = q.data;
    if (!list) return;
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const ids = list.map((c) => c.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try {
      await post('/admin/categories/reorder', { ids });
      await refresh();
    } catch (e) {
      toast.error(e);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    try {
      await del(`/admin/categories/${toDelete.id}`);
      setToDelete(null);
      await refresh();
    } catch (e) {
      toast.error(e);
      setToDelete(null);
    }
  };

  return (
    <AdminPage
      title={t('admin.categories')}
      actions={
        <Button size="sm" icon={Plus} onClick={() => setForm({ nameUz: '', nameRu: '', iconName: 'auto', imageUrl: null, origImageUrl: null, isActive: true })}>
          {t('common.add')}
        </Button>
      }
    >
      {q.isLoading && <OrdersListSkeleton />}
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      <div className="grid gap-2 lg:grid-cols-2">
        {q.data?.map((c, i) => (
          <Card key={c.id} className="flex items-center gap-3 p-3">
            <div className="relative">
              <CategoryVisual cat={c} className="h-14 w-14 rounded-xl" iconClassName="h-6 w-6" />
              {busyStatus(c) && (
                <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40">
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">
                {c.nameUz} <span className="text-muted">/ {c.nameRu}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
                {c._count?.products ?? 0} {t('nav.products').toLowerCase()}
                {!c.isActive && <Badge tone="muted">{t('common.inactive')}</Badge>}
                {busyStatus(c) && <Badge tone="info">{t('admin.catAiWorking')}</Badge>}
                {c.imageStatus === 'FAILED' && !c.imageUrl && <Badge tone="danger">{t('admin.catAiFailed')}</Badge>}
              </div>
            </div>
            <div className="flex items-center">
              <button className="rounded-lg p-1.5 text-muted hover:bg-surface disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t('admin.moveUp')}>
                <ArrowUp className="h-4 w-4" />
              </button>
              <button className="rounded-lg p-1.5 text-muted hover:bg-surface disabled:opacity-30" disabled={i === (q.data?.length || 0) - 1} onClick={() => move(i, 1)} aria-label={t('admin.moveDown')}>
                <ArrowDown className="h-4 w-4" />
              </button>
              <button className="rounded-lg p-1.5 text-accent hover:bg-surface disabled:opacity-30" disabled={busyStatus(c)} onClick={() => aiImage(c)} title={t('admin.catAiImage')} aria-label={t('admin.catAiImage')}>
                <Sparkles className="h-4 w-4" />
              </button>
              <button
                className="rounded-lg p-1.5 text-primary hover:bg-surface"
                onClick={() => setForm({ id: c.id, nameUz: c.nameUz, nameRu: c.nameRu, iconName: c.iconName, imageUrl: c.imageUrl ?? null, origImageUrl: c.imageUrl ?? null, isActive: c.isActive })}
                aria-label={t('common.edit')}
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button className="rounded-lg p-1.5 text-danger hover:bg-danger-soft" onClick={() => setToDelete(c)} aria-label={t('common.delete')}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </Card>
        ))}
      </div>

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? t('common.edit') : t('admin.newCategory')}
        footer={
          <div className="pb-2">
            <Button block loading={busy} disabled={!form?.nameUz.trim() || uploading} onClick={save}>
              {t('common.save')}
            </Button>
          </div>
        }
      >
        {form && (
          <div className="space-y-3">
            <Field label={t('pf.nameUz')}>
              <input className="input" value={form.nameUz} onChange={(e) => setForm({ ...form, nameUz: e.target.value })} />
            </Field>
            {form.id && form.nameRu && (
              <div className="text-[12px] text-muted">
                {t('pf.nameRu')}: <span className="font-semibold text-ink">{form.nameRu}</span>
              </div>
            )}

            <Field label={t('admin.catImage')} hint={t('admin.catImageHint')}>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
              <div className="flex items-center gap-3">
                {form.imageUrl ? (
                  <div className="relative">
                    <img src={form.imageUrl} alt="" className="h-20 w-20 rounded-xl border border-line bg-white object-cover" />
                    <button type="button" onClick={() => setForm({ ...form, imageUrl: null })} className="absolute -right-2 -top-2 rounded-full bg-card p-1 shadow-card" aria-label="remove">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-primary-light text-center text-[10.5px] font-semibold leading-tight text-primary">
                    <Wand2 className="h-5 w-5" />
                    {t('admin.catAuto')}
                  </div>
                )}
                <Button type="button" variant="outline" icon={ImagePlus} loading={uploading} onClick={() => fileRef.current?.click()}>
                  {t('admin.uploadImage')}
                </Button>
              </div>
            </Field>

            <Field label={t('admin.icon')} hint={t('admin.iconHint')}>
              <div className="grid grid-cols-8 gap-1.5">
                <button
                  type="button"
                  title={t('admin.catAuto')}
                  onClick={() => setForm({ ...form, iconName: 'auto' })}
                  className={clsx('flex aspect-square items-center justify-center rounded-xl border', form.iconName === 'auto' ? 'border-primary bg-primary text-white' : 'border-line text-primary')}
                >
                  <Wand2 className="h-5 w-5" />
                </button>
                {Object.keys(CATEGORY_ICONS).map((name) => (
                  <button
                    key={name}
                    type="button"
                    title={name}
                    onClick={() => setForm({ ...form, iconName: name })}
                    className={clsx('flex aspect-square items-center justify-center rounded-xl border', form.iconName === name ? 'border-primary bg-primary text-white' : 'border-line text-primary')}
                  >
                    <CategoryIcon name={name} className="h-5 w-5" />
                  </button>
                ))}
              </div>
            </Field>
            <Switch checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} label={t('common.active')} />
          </div>
        )}
      </Modal>
      <ConfirmModal open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={remove} danger title={`${t('common.delete')}: ${toDelete?.nameUz || ''}`} />
    </AdminPage>
  );
}
