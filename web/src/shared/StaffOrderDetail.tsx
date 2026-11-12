import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Bike, Camera, CheckCheck, ChefHat, CircleX, HandCoins, PackageCheck, Scale, Truck } from 'lucide-react';
import { get, post, upload } from './api';
import type { Order, Role } from './types';
import { Button, Card, ErrorState, PageLoader, ReasonModal, useToast } from './ui';
import { OrderContactBlock, OrderItemsList, OrderTimeline, OrderTotals, StatusBadge } from './orderParts';
import { dateTime, isWeighted, money, nameOf, personName, unitLabel } from './format';

export function StaffOrderDetail({
  orderId,
  role,
  meId,
  isWeb,
  fetchPath,
  extra,
}: {
  orderId: number;
  role: Role;
  meId?: number | null;
  isWeb?: boolean;
  fetchPath?: string;
  extra?: (o: Order) => React.ReactNode;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const path = fetchPath || `/staff/orders/${orderId}`;
  const q = useQuery({ queryKey: ['staff-order', path], queryFn: () => get<Order>(path), refetchInterval: 20000 });
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [weights, setWeights] = useState<Record<number, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  if (q.isLoading) return <PageLoader />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const o = q.data;

  const isSellerSide = role === 'SELLER' || role === 'ADMIN';
  const isMine = role === 'ADMIN' || o.sellerId === meId;
  const isCourierMine = role === 'ADMIN' || o.courierId === meId;

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['staff-order'] });
    await qc.invalidateQueries({ queryKey: ['staff-orders'] });
    await qc.invalidateQueries({ queryKey: ['courier-orders'] });
    await qc.invalidateQueries({ queryKey: ['admin-orders'] });
    await qc.invalidateQueries({ queryKey: ['staff-stats'] });
  };

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
      toast.success(t('staff.done'));
      await refresh();
    } catch (e) {
      toast.error(e);
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    await run('ready', () => upload(`/staff/orders/${o.id}/ready`, file, 'photo'));
    if (fileRef.current) fileRef.current.value = '';
  };

  const weighted = o.items.filter((i) => isWeighted(i.unit));
  const canWeigh = isSellerSide && isMine && ['ACCEPTED', 'PREPARING'].includes(o.status) && weighted.length > 0;
  const saveWeights = () =>
    run('weights', () =>
      post(`/staff/orders/${o.id}/weights`, {
        items: Object.entries(weights)
          .filter(([, v]) => v !== '' && Number(v) > 0)
          .map(([itemId, v]) => ({ itemId: Number(itemId), finalQty: Number(String(v).replace(',', '.')) })),
      }),
    ).then(() => setWeights({}));

  const final = ['DELIVERED', 'PICKED_UP', 'CANCELLED'].includes(o.status);
  const canCancel = isSellerSide && !final && (o.status === 'NEW' || isMine);

  return (
    <div className="space-y-3">
      <Card className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[20px] font-extrabold text-ink">#{o.number}</div>
            <div className="text-[12px] text-muted">{dateTime(o.createdAt)}</div>
          </div>
          <StatusBadge status={o.status} />
        </div>
        {(o.seller || o.courier) && (
          <div className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
            {o.seller && (
              <div className="rounded-xl bg-surface px-3 py-2">
                <div className="text-[11px] font-semibold text-muted">{t('orders.seller')}</div>
                <div className="font-semibold">{personName(o.seller)}</div>
              </div>
            )}
            {o.courier && (
              <div className="rounded-xl bg-surface px-3 py-2">
                <div className="text-[11px] font-semibold text-muted">{t('orders.courier')}</div>
                <div className="font-semibold">{personName(o.courier)}</div>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <OrderContactBlock order={o} />
      </Card>

      <Card className="p-4">
        <h3 className="mb-1 text-[15px] font-bold">{t('orders.items')}</h3>
        <OrderItemsList order={o} />
        <div className="mt-3 border-t border-line pt-3">
          <OrderTotals order={o} />
        </div>
      </Card>

      {canWeigh && (
        <Card className="p-4">
          <h3 className="mb-3 flex items-center gap-2 text-[15px] font-bold">
            <Scale className="h-4 w-4 text-primary" /> {t('staff.weights')}
          </h3>
          <div className="space-y-2.5">
            {weighted.map((it) => (
              <div key={it.id} className="flex items-center gap-3">
                <div className="min-w-0 flex-1 text-[14px]">
                  <div className="truncate font-semibold">{nameOf(it)}</div>
                  <div className="text-[12px] text-muted">
                    {it.qty} {unitLabel(it.unit)} · {money(it.price)}
                  </div>
                </div>
                <input
                  inputMode="decimal"
                  className="input w-28 text-right"
                  placeholder={String(it.finalQty ?? it.qty)}
                  value={weights[it.id] ?? ''}
                  onChange={(e) => setWeights((w) => ({ ...w, [it.id]: e.target.value.replace(/[^\d.,]/g, '') }))}
                />
                <span className="w-8 text-[13px] text-muted">{unitLabel(it.unit)}</span>
              </div>
            ))}
          </div>
          <Button className="mt-3" block variant="secondary" icon={Scale} loading={busy === 'weights'} disabled={!Object.values(weights).some((v) => Number(String(v).replace(',', '.')) > 0)} onClick={saveWeights}>
            {t('staff.saveWeights')}
          </Button>
        </Card>
      )}

      {o.readyPhotoUrl && (
        <Card className="overflow-hidden">
          <div className="px-4 pt-3 text-[13px] font-bold text-muted">{t('orders.readyPhoto')}</div>
          <a href={o.readyPhotoUrl} target="_blank" rel="noreferrer">
            <img src={o.readyPhotoUrl} alt="" className="mt-2 max-h-80 w-full object-cover" />
          </a>
        </Card>
      )}

      <Card className="p-4">
        <h3 className="mb-3 text-[15px] font-bold">{t('orders.timeline')}</h3>
        <OrderTimeline order={o} />
      </Card>

      {extra?.(o)}

      {/* Amallar */}
      <div className="space-y-2 pb-4">
        {isSellerSide && o.status === 'NEW' && (
          <Button block size="lg" icon={HandCoins} loading={busy === 'accept'} onClick={() => run('accept', () => post(`/staff/orders/${o.id}/accept`))}>
            {t('staff.accept')}
          </Button>
        )}
        {isSellerSide && isMine && o.status === 'ACCEPTED' && (
          <Button block size="lg" variant="secondary" icon={ChefHat} loading={busy === 'prepare'} onClick={() => run('prepare', () => post(`/staff/orders/${o.id}/prepare`))}>
            {t('staff.prepare')}
          </Button>
        )}
        {isSellerSide && isMine && ['ACCEPTED', 'PREPARING'].includes(o.status) && (
          <>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
            <Button block size="lg" icon={Camera} loading={busy === 'ready'} onClick={() => fileRef.current?.click()}>
              {t('staff.ready')}
            </Button>
            <p className="text-center text-[12px] text-muted">{t('staff.photoRequired')}</p>
          </>
        )}
        {isSellerSide && isMine && o.status === 'READY' && o.deliveryType === 'PICKUP' && (
          <Button block size="lg" variant="success" icon={PackageCheck} loading={busy === 'handover'} onClick={() => run('handover', () => post(`/staff/orders/${o.id}/handover`))}>
            {t('staff.handover')}
          </Button>
        )}
        {(role === 'COURIER' || (role === 'ADMIN' && !isWeb)) && o.status === 'READY' && o.deliveryType === 'DELIVERY' && !o.courierId && (
          <Button block size="lg" icon={Bike} loading={busy === 'take'} onClick={() => run('take', () => post(`/staff/courier/orders/${o.id}/take`))}>
            {t('staff.take')}
          </Button>
        )}
        {(role === 'COURIER' || role === 'ADMIN') && isCourierMine && o.status === 'READY' && o.courierId && (
          <Button block size="lg" icon={Truck} loading={busy === 'way'} onClick={() => run('way', () => post(`/staff/courier/orders/${o.id}/on-the-way`))}>
            {t('staff.onTheWay')}
          </Button>
        )}
        {(role === 'COURIER' || role === 'ADMIN') && isCourierMine && o.status === 'ON_THE_WAY' && (
          <Button block size="lg" variant="success" icon={CheckCheck} loading={busy === 'dlv'} onClick={() => run('dlv', () => post(`/staff/courier/orders/${o.id}/delivered`))}>
            {t('staff.delivered')}
          </Button>
        )}
        {canCancel && (
          <Button block variant="outline" className="text-danger" icon={CircleX} onClick={() => setCancelOpen(true)}>
            {t('staff.cancel')}
          </Button>
        )}
      </div>

      <ReasonModal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={t('orders.cancelConfirm')}
        loading={busy === 'cancel'}
        onSubmit={(reason) => run('cancel', () => post(`/staff/orders/${o.id}/cancel`, { reason })).then(() => setCancelOpen(false))}
      />
    </div>
  );
}
