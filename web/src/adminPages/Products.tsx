import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Percent, Plus, Search, Tags, Trash2 } from 'lucide-react';
import { del, get, patch, post, qs } from '../shared/api';
import type { Category, Paged, Product } from '../shared/types';
import { Badge, Button, Card, ConfirmModal, Empty, ErrorState, Field, Modal, Pager, Segmented, Switch, Tabs, clsx, useToast } from '../shared/ui';
import { ProductThumb } from '../shared/orderParts';
import { ProductForm } from '../shared/ProductForm';
import { OrdersListSkeleton } from '../shared/staffParts';
import { CATEGORY_ICONS, CategoryIcon } from '../shared/icons';
import { money, nameOf, qty, unitLabel } from '../shared/format';
import { AdminPage, TableWrap, useIsMobile } from './common';

function BulkPriceModal({ open, onClose, ids, categories }: { open: boolean; onClose: () => void; ids: number[]; categories: Category[] }) {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const [target, setTarget] = useState<'selected' | 'category'>(ids.length ? 'selected' : 'category');
  const [categoryId, setCategoryId] = useState('');
  const [mode, setMode] = useState<'percent' | 'fixed' | 'set'>('percent');
  const [value, setValue] = useState('');
  const [keepOld, setKeepOld] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setTarget(ids.length ? 'selected' : 'category');
      setCategoryId(categories[0] ? String(categories[0].id) : '');
      setValue('');
    }
  }, [open]);
  const submit = async () => {
    setBusy(true);
    try {
      const r = await post<{ updated: number }>('/admin/products/bulk-price', {
        ...(target === 'selected' ? { productIds: ids } : { categoryId: Number(categoryId) }),
        mode,
        value: Number(value.replace(',', '.')),
        keepOldPrice: keepOld,
      });
      toast.success(t('admin.bulkDone', { count: r.updated }));
      await qc.invalidateQueries({ queryKey: ['manage-products'] });
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('admin.bulkPrice')}
      footer={
        <div className="pb-2">
          <Button block loading={busy} disabled={!value || (target === 'category' && !categoryId) || (target === 'selected' && !ids.length)} onClick={submit}>
            {t('admin.bulkApply')}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Segmented
          value={target}
          onChange={setTarget}
          items={[
            { value: 'selected', label: t('admin.selected', { count: ids.length }) },
            { value: 'category', label: t('admin.applyToCategory') },
          ]}
        />
        {target === 'category' && (
          <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{nameOf(c)}</option>
            ))}
          </select>
        )}
        <Field label={t('admin.bulkMode')}>
          <select className="input" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
            <option value="percent">{t('admin.bulkPercent')}</option>
            <option value="fixed">{t('admin.bulkFixed')}</option>
            <option value="set">{t('admin.bulkSet')}</option>
          </select>
        </Field>
        <Field label={t('admin.bulkValue')} hint={mode === 'percent' ? '+10 / -15' : undefined}>
          <input className="input" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.,-]/g, ''))} />
        </Field>
        <Switch checked={keepOld} onChange={setKeepOld} label={t('admin.bulkKeepOld')} />
      </div>
    </Modal>
  );
}

export function ProductsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const mobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('all');
  const [categoryId, setCategoryId] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Product | null>(null);
  useEffect(() => {
    const h = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(h);
  }, [search]);
  const cats = useQuery({ queryKey: ['manage-categories'], queryFn: () => get<Category[]>('/manage/categories') });
  const q = useQuery({
    queryKey: ['manage-products', debounced, status, categoryId, page, 'admin'],
    queryFn: () => get<Paged<Product>>(`/manage/products${qs({ q: debounced, status, categoryId, page, limit: 50 })}`),
  });

  const toggleActive = async (p: Product) => {
    try {
      await post(`/manage/products/${p.id}/active`, { isActive: !p.isActive });
      await qc.invalidateQueries({ queryKey: ['manage-products'] });
    } catch (e) {
      toast.error(e);
    }
  };
  const remove = async () => {
    if (!toDelete) return;
    try {
      const r = await del<{ deactivated?: boolean }>(`/manage/products/${toDelete.id}`);
      toast.success(r.deactivated ? t('common.inactive') : t('common.saved'));
      setToDelete(null);
      await qc.invalidateQueries({ queryKey: ['manage-products'] });
    } catch (e) {
      toast.error(e);
    }
  };
  const move = async (index: number, dir: -1 | 1) => {
    const items = q.data?.items;
    if (!items) return;
    const j = index + dir;
    if (j < 0 || j >= items.length) return;
    const ids = items.map((p) => p.id);
    [ids[index], ids[j]] = [ids[j], ids[index]];
    try {
      await post('/admin/products/reorder', { ids });
      await qc.invalidateQueries({ queryKey: ['manage-products'] });
    } catch (e) {
      toast.error(e);
    }
  };
  const allSel = !!q.data?.items.length && q.data.items.every((p) => selected.includes(p.id));

  return (
    <AdminPage
      title={t('admin.products')}
      root
      actions={
        <>
          <Button size="sm" variant="secondary" icon={Percent} onClick={() => setBulkOpen(true)}>
            {mobile ? '' : t('admin.bulkPrice')}
          </Button>
          <Button size="sm" icon={Plus} onClick={() => navigate('/products/new')}>
            {t('common.add')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input className="input h-10 pl-9" placeholder={t('shop.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input h-10 w-auto py-1" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}>
            <option value="">{t('common.all')}</option>
            {cats.data?.map((c) => (
              <option key={c.id} value={c.id}>{nameOf(c)}</option>
            ))}
          </select>
          <Button size="sm" variant="outline" icon={Tags} onClick={() => navigate('/categories')}>{t('admin.categories')}</Button>
        </div>
        <Tabs
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
          items={[
            { value: 'all', label: t('common.all') },
            { value: 'active', label: t('common.active') },
            { value: 'inactive', label: t('common.inactive') },
            { value: 'low', label: t('nav.low') },
            { value: 'out', label: t('product.outOfStock') },
          ]}
        />
        {q.isLoading && <OrdersListSkeleton />}
        {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
        {q.data?.items.length === 0 && <Empty icon={Search} title={t('shop.noProducts')} />}
        {q.data && q.data.items.length > 0 && (
          mobile ? (
            <div className="space-y-2">
              {q.data.items.map((p) => (
                <Card key={p.id} className="flex items-center gap-3 p-2.5">
                  <input type="checkbox" className="h-4 w-4 accent-[#6F4E37]" checked={selected.includes(p.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id)))} />
                  <ProductThumb url={p.image?.thumbUrl} className="h-12 w-12 rounded-xl" />
                  <button className="min-w-0 flex-1 text-left" onClick={() => navigate(`/products/${p.id}`)}>
                    <div className="truncate text-[14px] font-semibold">{nameOf(p)}</div>
                    <div className="text-[12px] text-muted">
                      {money(p.price)} · <span className={p.isLow ? 'font-bold text-danger' : ''}>{qty(p.stock)} {unitLabel(p.unit)}</span>
                    </div>
                  </button>
                  <button onClick={() => toggleActive(p)} className="p-1.5 text-muted" aria-label="toggle">
                    {p.isActive ? <Eye className="h-5 w-5 text-success" /> : <EyeOff className="h-5 w-5" />}
                  </button>
                </Card>
              ))}
            </div>
          ) : (
            <TableWrap>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>
                      <input type="checkbox" className="h-4 w-4 accent-[#6F4E37]" checked={allSel} onChange={(e) => setSelected(e.target.checked ? q.data!.items.map((p) => p.id) : [])} />
                    </th>
                    <th></th>
                    <th>{t('common.name')}</th>
                    <th>{t('pf.category')}</th>
                    <th className="text-right">{t('pf.price')}</th>
                    <th className="text-right">{t('staff.currentStock')}</th>
                    <th>{t('common.status')}</th>
                    <th className="text-right">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.items.map((p, i) => (
                    <tr key={p.id}>
                      <td>
                        <input type="checkbox" className="h-4 w-4 accent-[#6F4E37]" checked={selected.includes(p.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id)))} />
                      </td>
                      <td><ProductThumb url={p.image?.thumbUrl} className="h-10 w-10 rounded-lg" /></td>
                      <td>
                        <button className="text-left font-semibold hover:text-primary" onClick={() => navigate(`/products/${p.id}`)}>{nameOf(p)}</button>
                        <div className="text-[12px] text-muted">{p.nameRu}</div>
                      </td>
                      <td className="text-muted">{nameOf(p.category)}</td>
                      <td className="whitespace-nowrap text-right">
                        <div className="font-bold">{money(p.price)}</div>
                        {p.oldPrice && <div className="text-[12px] text-muted line-through">{money(p.oldPrice)}</div>}
                      </td>
                      <td className={clsx('whitespace-nowrap text-right font-bold', p.isLow && 'text-danger')}>
                        {qty(p.stock)} {unitLabel(p.unit)}
                      </td>
                      <td>{p.isActive ? <Badge tone="success">{t('common.active')}</Badge> : <Badge tone="muted">{t('common.inactive')}</Badge>}</td>
                      <td>
                        <div className="flex justify-end gap-0.5">
                          {!categoryId ? null : (
                            <>
                              <button className="rounded-lg p-1.5 text-muted hover:bg-surface disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} title={t('admin.moveUp')}><ArrowUp className="h-4 w-4" /></button>
                              <button className="rounded-lg p-1.5 text-muted hover:bg-surface disabled:opacity-30" disabled={i === q.data!.items.length - 1} onClick={() => move(i, 1)} title={t('admin.moveDown')}><ArrowDown className="h-4 w-4" /></button>
                            </>
                          )}
                          <button className="rounded-lg p-1.5 text-muted hover:bg-surface" onClick={() => toggleActive(p)} title={p.isActive ? t('common.inactive') : t('common.active')}>
                            {p.isActive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                          <button className="rounded-lg p-1.5 text-primary hover:bg-surface" onClick={() => navigate(`/products/${p.id}`)} title={t('common.edit')}><Pencil className="h-4 w-4" /></button>
                          <button className="rounded-lg p-1.5 text-danger hover:bg-[#FBEAE8]" onClick={() => setToDelete(p)} title={t('common.delete')}><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )
        )}
        {q.data && <Pager page={page} pages={q.data.pages} onChange={setPage} />}
      </div>
      <BulkPriceModal open={bulkOpen} onClose={() => setBulkOpen(false)} ids={selected} categories={cats.data || []} />
      <ConfirmModal open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={remove} danger title={`${t('common.delete')}: ${toDelete ? nameOf(toDelete) : ''}`} />
    </AdminPage>
  );
}

export function ProductEditPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';
  return (
    <AdminPage title={isNew ? t('pf.newTitle') : t('pf.editTitle')}>
      <div className="mx-auto max-w-3xl">
        <ProductForm productId={isNew ? undefined : Number(id)} onSaved={() => navigate('/products')} onCancel={() => navigate(-1)} />
      </div>
    </AdminPage>
  );
}

// ================= KATEGORIYALAR =================
type CatForm = { id?: number; nameUz: string; nameRu: string; iconName: string; isActive: boolean };

export function CategoriesPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-categories'], queryFn: () => get<Category[]>('/admin/categories') });
  const [form, setForm] = useState<CatForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<Category | null>(null);

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['admin-categories'] });
    await qc.invalidateQueries({ queryKey: ['manage-categories'] });
    await qc.invalidateQueries({ queryKey: ['categories'] });
  };
  const save = async () => {
    if (!form) return;
    setBusy(true);
    try {
      const body = { nameUz: form.nameUz.trim(), nameRu: form.nameRu.trim(), iconName: form.iconName, isActive: form.isActive };
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
      actions={<Button size="sm" icon={Plus} onClick={() => setForm({ nameUz: '', nameRu: '', iconName: 'ShoppingBasket', isActive: true })}>{t('common.add')}</Button>}
    >
      {q.isLoading && <OrdersListSkeleton />}
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      <div className="space-y-2">
        {q.data?.map((c, i) => (
          <Card key={c.id} className="flex items-center gap-3 p-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft">
              <CategoryIcon name={c.iconName} className="h-5 w-5 text-primary" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{c.nameUz} <span className="text-muted">/ {c.nameRu}</span></div>
              <div className="text-[12px] text-muted">
                {c._count?.products ?? 0} {t('nav.products').toLowerCase()}
                {!c.isActive && <Badge tone="muted" className="ml-2">{t('common.inactive')}</Badge>}
              </div>
            </div>
            <div className="flex items-center">
              <button className="rounded-lg p-1.5 text-muted hover:bg-surface disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t('admin.moveUp')}><ArrowUp className="h-4 w-4" /></button>
              <button className="rounded-lg p-1.5 text-muted hover:bg-surface disabled:opacity-30" disabled={i === (q.data?.length || 0) - 1} onClick={() => move(i, 1)} aria-label={t('admin.moveDown')}><ArrowDown className="h-4 w-4" /></button>
              <button className="rounded-lg p-1.5 text-primary hover:bg-surface" onClick={() => setForm({ id: c.id, nameUz: c.nameUz, nameRu: c.nameRu, iconName: c.iconName, isActive: c.isActive })} aria-label={t('common.edit')}><Pencil className="h-4 w-4" /></button>
              <button className="rounded-lg p-1.5 text-danger hover:bg-[#FBEAE8]" onClick={() => setToDelete(c)} aria-label={t('common.delete')}><Trash2 className="h-4 w-4" /></button>
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
            <Button block loading={busy} disabled={!form?.nameUz.trim() || !form?.nameRu.trim()} onClick={save}>{t('common.save')}</Button>
          </div>
        }
      >
        {form && (
          <div className="space-y-3">
            <Field label={t('pf.nameUz')}>
              <input className="input" value={form.nameUz} onChange={(e) => setForm({ ...form, nameUz: e.target.value })} />
            </Field>
            <Field label={t('pf.nameRu')}>
              <input className="input" value={form.nameRu} onChange={(e) => setForm({ ...form, nameRu: e.target.value })} />
            </Field>
            <Field label={t('admin.icon')}>
              <div className="grid grid-cols-8 gap-1.5">
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
