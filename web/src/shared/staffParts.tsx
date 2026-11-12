import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, ChevronRight, MapPin, PackageSearch, Search, SlidersHorizontal, Store } from 'lucide-react';
import { get, post, qs } from './api';
import type { Category, Order, Paged, Product, StockMovement } from './types';
import { Badge, Button, Card, Empty, ErrorState, Field, Modal, Pager, Segmented, Skeleton, Tabs, clsx, useToast } from './ui';
import { ProductThumb, StatusBadge } from './orderParts';
import { dateTime, money, nameOf, personName, qty, timeOnly, unitLabel } from './format';

export function StaffOrderCard({ o, onClick }: { o: Order; onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <Card className="p-4" onClick={onClick}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[16px] font-extrabold text-ink">#{o.number}</div>
          <div className="text-[12px] text-muted">{dateTime(o.createdAt)}</div>
        </div>
        <StatusBadge status={o.status} />
      </div>
      <div className="mt-2.5 space-y-1 text-[13px]">
        <div className="flex items-center gap-1.5 font-semibold text-ink">
          {o.deliveryType === 'DELIVERY' ? <MapPin className="h-4 w-4 text-primary-light" /> : <Store className="h-4 w-4 text-primary-light" />}
          {o.deliveryType === 'DELIVERY' ? t('orders.delivery') : t('orders.pickup')}
          <span className="font-normal text-muted">· {personName(o.customer)}</span>
        </div>
        {o.address && <div className="truncate text-muted">{o.address}</div>}
        <div className="text-muted">
          {o.items.length} × · {o.items.slice(0, 3).map((i) => nameOf(i)).join(', ')}
          {o.items.length > 3 ? '…' : ''}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[15px] font-extrabold text-primary">{money(o.finalTotal)}</span>
        <ChevronRight className="h-5 w-5 text-muted" />
      </div>
    </Card>
  );
}

export function OrdersListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-32 w-full" />
      ))}
    </div>
  );
}

/** Xodimlar uchun mahsulotlar ro'yxati (qidiruv + filtr) */
export function ManageProductsList({ onOpen, showStock = true, initialStatus = 'all' }: { onOpen: (p: Product) => void; showStock?: boolean; initialStatus?: string }) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState(initialStatus);
  const [categoryId, setCategoryId] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const h = setTimeout(() => {
      setDebounced(q.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(h);
  }, [q]);
  const cats = useQuery({ queryKey: ['manage-categories'], queryFn: () => get<Category[]>('/manage/categories') });
  const list = useQuery({
    queryKey: ['manage-products', debounced, status, categoryId, page],
    queryFn: () => get<Paged<Product>>(`/manage/products${qs({ q: debounced, status, categoryId, page, limit: 50 })}`),
  });
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
        <input className="input h-11 pl-11" placeholder={t('shop.searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 shrink-0 text-muted" />
        <select className="input h-9 py-1 text-[13px]" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}>
          <option value="">{t('common.all')}</option>
          {cats.data?.map((c) => (
            <option key={c.id} value={c.id}>{nameOf(c)}</option>
          ))}
        </select>
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
      {list.isLoading && <OrdersListSkeleton />}
      {list.error && <ErrorState error={list.error} onRetry={() => list.refetch()} />}
      {list.data?.items.length === 0 && <Empty icon={PackageSearch} title={t('shop.noProducts')} />}
      <div className="space-y-2">
        {list.data?.items.map((p) => (
          <Card key={p.id} className="flex items-center gap-3 p-2.5" onClick={() => onOpen(p)}>
            <ProductThumb url={p.image?.thumbUrl} className="h-14 w-14 rounded-xl" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-semibold text-ink">{nameOf(p)}</div>
              <div className="text-[12px] text-muted">
                {money(p.price)} / {unitLabel(p.unit)}
                {!p.isActive && <Badge tone="muted" className="ml-1.5">{t('common.inactive')}</Badge>}
              </div>
            </div>
            {showStock && (
              <div className={clsx('text-right text-[14px] font-extrabold', p.isLow ? 'text-danger' : 'text-primary-dark')}>
                {qty(p.stock)}
                <div className="text-[11px] font-semibold text-muted">{unitLabel(p.unit)}</div>
              </div>
            )}
            <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
          </Card>
        ))}
      </div>
      {list.data && <Pager page={page} pages={list.data.pages} onChange={setPage} />}
    </div>
  );
}

/** Kirim / chiqim / tuzatish oynasi */
export function StockMoveModal({ product, open, onClose, initialType = 'IN' }: { product: Product | null; open: boolean; onClose: () => void; initialType?: 'IN' | 'OUT' | 'ADJUST' }) {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const [type, setType] = useState<'IN' | 'OUT' | 'ADJUST'>(initialType);
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setType(initialType);
      setValue('');
      setNote('');
    }
  }, [open, initialType]);
  if (!product) return null;
  const n = Number(value.replace(',', '.'));
  const valid = value !== '' && n >= 0 && (type === 'ADJUST' || n > 0) && note.trim().length >= 2;
  const after = type === 'IN' ? product.stock + n : type === 'OUT' ? product.stock - n : n;

  const submit = async () => {
    setBusy(true);
    try {
      await post('/manage/stock/movements', { productId: product.id, type, qty: n, note: note.trim() });
      toast.success(t('staff.movementSaved'));
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['manage-products'] }),
        qc.invalidateQueries({ queryKey: ['manage-product'] }),
        qc.invalidateQueries({ queryKey: ['movements'] }),
        qc.invalidateQueries({ queryKey: ['low-stock'] }),
        qc.invalidateQueries({ queryKey: ['low-count'] }),
      ]);
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
      title={t('staff.movement')}
      footer={
        <div className="pb-2">
          <Button block size="lg" loading={busy} disabled={!valid} onClick={submit}>
            {t('common.save')}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center gap-3 rounded-2xl bg-surface p-3">
          <ProductThumb url={product.image?.thumbUrl} className="h-12 w-12 rounded-xl" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-semibold">{nameOf(product)}</div>
            <div className="text-[12px] text-muted">
              {t('staff.currentStock')}: <b className="text-ink">{qty(product.stock)} {unitLabel(product.unit)}</b>
            </div>
          </div>
        </div>
        <Segmented
          value={type}
          onChange={setType}
          items={[
            { value: 'IN', label: t('staff.stockIn'), icon: ArrowDownToLine },
            { value: 'OUT', label: t('staff.stockOut'), icon: ArrowUpFromLine },
            { value: 'ADJUST', label: t('staff.stockAdjust') },
          ]}
        />
        <Field label={type === 'ADJUST' ? t('staff.newStock') : t('staff.qty')}>
          <div className="flex items-center gap-2">
            <input autoFocus inputMode="decimal" className="input text-[18px] font-bold" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.,]/g, ''))} />
            <span className="text-[14px] font-semibold text-muted">{unitLabel(product.unit)}</span>
          </div>
        </Field>
        {value !== '' && (
          <div className={clsx('text-[13px] font-semibold', after < 0 ? 'text-danger' : 'text-muted')}>
            → {qty(after)} {unitLabel(product.unit)}
          </div>
        )}
        <Field label={t('common.reason')} hint={t('staff.reasonRequired')}>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </Field>
      </div>
    </Modal>
  );
}

export function MovementsList({ productId, compact }: { productId?: number; compact?: boolean }) {
  const { t } = useTranslation();
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['movements', productId, type, page],
    queryFn: () => get<Paged<StockMovement>>(`/manage/stock/movements${qs({ productId, type, page, limit: compact ? 20 : 50 })}`),
  });
  return (
    <div className="space-y-3">
      {!compact && (
        <Tabs
          value={type}
          onChange={(v) => { setType(v); setPage(1); }}
          items={[
            { value: '', label: t('common.all') },
            { value: 'IN', label: t('mv.IN') },
            { value: 'OUT', label: t('mv.OUT') },
            { value: 'ORDER', label: t('mv.ORDER') },
            { value: 'ADJUST', label: t('mv.ADJUST') },
            { value: 'RETURN', label: t('mv.RETURN') },
          ]}
        />
      )}
      {q.isLoading && <OrdersListSkeleton />}
      {q.data?.items.length === 0 && <Empty icon={PackageSearch} title={t('common.empty')} />}
      <div className="divide-y divide-line rounded-2xl bg-white shadow-card">
        {q.data?.items.map((m) => (
          <div key={m.id} className="flex items-center gap-3 px-3.5 py-2.5">
            <div className="min-w-0 flex-1">
              {!productId && <div className="truncate text-[14px] font-semibold">{nameOf(m.product)}</div>}
              <div className="text-[12px] text-muted">
                <Badge tone={m.qty >= 0 ? 'success' : 'danger'} className="mr-1.5">{t(`mv.${m.type}`)}</Badge>
                {dateTime(m.createdAt)}
              </div>
              {(m.note || m.actorLabel) && (
                <div className="mt-0.5 truncate text-[12px] text-ink/70">
                  {m.note}
                  {m.actorLabel ? ` · ${m.actorLabel}` : ''}
                </div>
              )}
            </div>
            <div className="text-right">
              <div className={clsx('text-[14px] font-extrabold', m.qty >= 0 ? 'text-success' : 'text-danger')}>
                {m.qty > 0 ? '+' : ''}
                {qty(m.qty)} {unitLabel(m.product.unit)}
              </div>
              {m.stockAfter != null && <div className="text-[11px] text-muted">→ {qty(m.stockAfter)}</div>}
            </div>
          </div>
        ))}
      </div>
      {q.data && <Pager page={page} pages={q.data.pages} onChange={setPage} />}
    </div>
  );
}

export function LowStockList({ onOpen }: { onOpen: (p: Product) => void }) {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['low-stock'], queryFn: () => get<Product[]>('/manage/stock/low') });
  if (q.isLoading) return <OrdersListSkeleton />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data?.length) return <Empty icon={PackageSearch} title={t('common.empty')} />;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-2xl bg-[#FBEAE8] px-3.5 py-3 text-[14px] font-bold text-danger">
        <AlertTriangle className="h-5 w-5" />
        {t('staff.lowCount', { count: q.data.length })}
      </div>
      {q.data.map((p) => (
        <Card key={p.id} className="flex items-center gap-3 p-2.5" onClick={() => onOpen(p)}>
          <ProductThumb url={p.image?.thumbUrl} className="h-12 w-12 rounded-xl" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-semibold">{nameOf(p)}</div>
            <div className="text-[12px] text-muted">
              {t('pf.lowThreshold')}: {qty(p.lowStockThreshold)} {unitLabel(p.unit)}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-danger" />
            <span className="text-[15px] font-extrabold text-danger">
              {qty(p.stock)} {unitLabel(p.unit)}
            </span>
          </div>
        </Card>
      ))}
    </div>
  );
}

export { timeOnly };
