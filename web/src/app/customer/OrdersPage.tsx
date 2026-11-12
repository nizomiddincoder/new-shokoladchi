import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronRight, CircleX, MapPin, ReceiptText, RotateCcw, Store } from 'lucide-react';
import { get, post } from '../../shared/api';
import type { Order } from '../../shared/types';
import { Button, Card, Empty, ErrorState, PageLoader, ReasonModal, Skeleton, useToast } from '../../shared/ui';
import { OrderItemsList, OrderTimeline, OrderTotals, ProductThumb, StatusBadge } from '../../shared/orderParts';
import { dateTime, money, personName, phoneHref, prettyPhone } from '../../shared/format';
import { PageHeader, Screen, TopTitle } from '../layout';

export function OrdersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['orders'], queryFn: () => get<Order[]>('/shop/orders'), refetchInterval: 30000 });
  return (
    <Screen>
      <TopTitle title={t('orders.title')} />
      <div className="space-y-3 px-4">
        {q.isLoading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
        {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
        {q.data?.length === 0 && (
          <Empty icon={ReceiptText} title={t('orders.empty')} text={t('orders.emptyText')} action={<Button onClick={() => navigate('/catalog')}>{t('cart.goCatalog')}</Button>} />
        )}
        {q.data?.map((o) => (
          <Card key={o.id} className="p-4" onClick={() => navigate(`/orders/${o.id}`)}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[15px] font-bold text-ink">{t('orders.number', { number: o.number })}</div>
                <div className="text-[12px] text-muted">{dateTime(o.createdAt)}</div>
              </div>
              <StatusBadge status={o.status} />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div className="flex -space-x-2">
                {o.items.slice(0, 4).map((i) => (
                  <ProductThumb key={i.id} url={i.thumbUrl} className="h-9 w-9 rounded-full border-2 border-white" />
                ))}
                {o.items.length > 4 && (
                  <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-primary-soft text-[11px] font-bold text-primary-dark">+{o.items.length - 4}</span>
                )}
              </div>
              <div className="flex items-center gap-1 text-[15px] font-extrabold text-primary">
                {money(o.finalTotal)}
                <ChevronRight className="h-4 w-4 text-muted" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </Screen>
  );
}

export function OrderDetailPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['order', id], queryFn: () => get<Order>(`/shop/orders/${id}`), refetchInterval: 15000 });
  const [cancelOpen, setCancelOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (q.isLoading) return <PageLoader />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const o = q.data;

  const cancel = async (reason: string) => {
    setBusy(true);
    try {
      await post(`/shop/orders/${o.id}/cancel`, { reason });
      toast.success(t('orders.cancelled'));
      setCancelOpen(false);
      await qc.invalidateQueries({ queryKey: ['order', id] });
      await qc.invalidateQueries({ queryKey: ['orders'] });
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const reorder = async () => {
    setBusy(true);
    try {
      const r = await post<{ skipped: string[] }>(`/shop/orders/${o.id}/reorder`);
      await qc.invalidateQueries({ queryKey: ['cart'] });
      toast.success(t('orders.reorderDone') + (r.skipped.length ? ` (−${r.skipped.length})` : ''));
      navigate('/cart');
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fade-in mx-auto max-w-xl" style={{ paddingBottom: 'calc(var(--safe-bottom) + 24px)' }}>
      <PageHeader title={t('orders.number', { number: o.number })} />
      <div className="space-y-3 px-4 pt-3">
        <Card className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[12px] text-muted">{dateTime(o.createdAt)}</div>
              <div className="mt-1 flex items-center gap-1.5 text-[14px] font-semibold">
                {o.deliveryType === 'DELIVERY' ? <MapPin className="h-4 w-4 text-primary" /> : <Store className="h-4 w-4 text-primary" />}
                {o.deliveryType === 'DELIVERY' ? t('orders.delivery') : t('orders.pickup')}
              </div>
              {o.address && <div className="mt-0.5 text-[13px] text-muted">{o.address}</div>}
            </div>
            <StatusBadge status={o.status} />
          </div>
          {o.courier && (
            <div className="mt-3 flex items-center justify-between rounded-xl bg-surface px-3 py-2 text-[13px]">
              <div>
                <span className="text-muted">{t('orders.courier')}: </span>
                <span className="font-semibold">{personName(o.courier)}</span>
              </div>
              {phoneHref(o.courier.phone) && (
                <a href={phoneHref(o.courier.phone)} className="font-bold text-primary">{prettyPhone(o.courier.phone)}</a>
              )}
            </div>
          )}
        </Card>

        {o.readyPhotoUrl && (
          <Card className="overflow-hidden">
            <div className="px-4 pt-3 text-[13px] font-bold text-muted">{t('orders.readyPhoto')}</div>
            <img src={o.readyPhotoUrl} alt="" className="mt-2 max-h-96 w-full object-cover" />
          </Card>
        )}

        <Card className="p-4">
          <h3 className="mb-3 text-[15px] font-bold">{t('orders.timeline')}</h3>
          <OrderTimeline order={o} />
        </Card>

        <Card className="p-4">
          <h3 className="mb-1 text-[15px] font-bold">{t('orders.items')}</h3>
          <OrderItemsList order={o} />
          <div className="mt-3 border-t border-line pt-3">
            <OrderTotals order={o} />
          </div>
        </Card>

        <div className="space-y-2 pt-1">
          <Button block size="lg" icon={RotateCcw} loading={busy && !cancelOpen} onClick={reorder}>
            {t('orders.reorder')}
          </Button>
          {o.status === 'NEW' && (
            <Button block variant="outline" className="text-danger" icon={CircleX} onClick={() => setCancelOpen(true)}>
              {t('orders.cancel')}
            </Button>
          )}
        </div>
      </div>
      <ReasonModal open={cancelOpen} onClose={() => setCancelOpen(false)} onSubmit={cancel} loading={busy} title={t('orders.cancelConfirm')} />
    </div>
  );
}
