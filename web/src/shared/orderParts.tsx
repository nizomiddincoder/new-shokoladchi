import { useTranslation } from 'react-i18next';
import { Check, CircleX, ImageOff, MapPin, Package, Phone } from 'lucide-react';
import type { Order, OrderStatus } from './types';
import { Badge, clsx } from './ui';
import { dateTime, isWeighted, mapsLinks, money, nameOf, personName, phoneHref, prettyPhone, qty, timeOnly, unitLabel } from './format';

export const STATUS_TONE: Record<OrderStatus, 'info' | 'warning' | 'soft' | 'success' | 'danger' | 'primary' | 'accent' | 'muted'> = {
  NEW: 'info',
  ACCEPTED: 'warning',
  PREPARING: 'warning',
  READY: 'accent',
  ON_THE_WAY: 'primary',
  DELIVERED: 'success',
  PICKED_UP: 'success',
  CANCELLED: 'danger',
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useTranslation();
  return <Badge tone={STATUS_TONE[status]}>{t(`status.${status}`)}</Badge>;
}

export function ProductThumb({ url, className, alt = '' }: { url: string | null | undefined; className?: string; alt?: string }) {
  return (
    <div className={clsx('flex shrink-0 items-center justify-center overflow-hidden bg-surface', className)}>
      {url ? <img src={url} alt={alt} loading="lazy" className="h-full w-full object-cover" /> : <ImageOff className="h-1/3 w-1/3 text-line" />}
    </div>
  );
}

export function OrderItemsList({ order }: { order: Order }) {
  const { t } = useTranslation();
  return (
    <div className="divide-y divide-line">
      {order.items.map((it) => {
        const q = it.finalQty ?? it.qty;
        const approx = isWeighted(it.unit) && it.finalQty == null;
        return (
          <div key={it.id} className="flex items-center gap-3 py-2.5">
            <ProductThumb url={it.thumbUrl} className="h-12 w-12 rounded-xl" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-semibold text-ink">{nameOf(it)}</div>
              <div className="text-[12px] text-muted">
                {qty(q)} {unitLabel(it.unit)} x {money(it.price)}
                {it.finalQty != null && it.finalQty !== it.qty && (
                  <span className="ml-1 line-through">({qty(it.qty)})</span>
                )}
              </div>
            </div>
            <div className="text-right text-[14px] font-bold text-primary-dark">
              {money(it.lineTotal)}
              {approx && <div className="text-[10px] font-semibold text-muted">{t('cart.approxTotal')}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function OrderTotals({ order }: { order: Order }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5 text-[14px]">
      <div className="flex justify-between text-muted">
        <span>{t('cart.items')}</span>
        <span>{money(order.itemsTotal)}</span>
      </div>
      {order.deliveryType === 'DELIVERY' && (
        <div className="flex justify-between text-muted">
          <span>{t('cart.delivery')}</span>
          <span>{order.deliveryFee ? money(order.deliveryFee) : t('cart.deliveryFree')}</span>
        </div>
      )}
      <div className="flex justify-between pt-1 font-display text-[18px] font-bold text-ink">
        <span>{t('common.total')}</span>
        <span className="text-primary">{money(order.finalTotal)}</span>
      </div>
      {order.finalTotal !== order.initialTotal && (
        <div className="text-[12px] text-muted">
          {t('orders.totalChanged')}: <s>{money(order.initialTotal)}</s>
        </div>
      )}
    </div>
  );
}

const FLOW_DELIVERY: OrderStatus[] = ['NEW', 'ACCEPTED', 'PREPARING', 'READY', 'ON_THE_WAY', 'DELIVERED'];
const FLOW_PICKUP: OrderStatus[] = ['NEW', 'ACCEPTED', 'PREPARING', 'READY', 'PICKED_UP'];

function statusTime(o: Order, s: OrderStatus) {
  switch (s) {
    case 'NEW':
      return o.createdAt;
    case 'ACCEPTED':
      return o.acceptedAt;
    case 'PREPARING':
      return o.preparingAt;
    case 'READY':
      return o.readyAt;
    case 'ON_THE_WAY':
      return o.pickedUpAt;
    case 'DELIVERED':
      return o.deliveredAt;
    case 'PICKED_UP':
      return o.pickedUpAt;
    default:
      return null;
  }
}

export function OrderTimeline({ order }: { order: Order }) {
  const { t } = useTranslation();
  const flow = order.deliveryType === 'DELIVERY' ? FLOW_DELIVERY : FLOW_PICKUP;
  const steps = flow.filter((s) => s !== 'PREPARING' || order.preparingAt);
  const currentIdx = order.status === 'CANCELLED' ? -1 : steps.indexOf(order.status);
  return (
    <ol className="relative ml-1">
      {steps.map((s, i) => {
        const time = statusTime(order, s);
        const done = order.status === 'CANCELLED' ? !!time : i <= currentIdx;
        return (
          <li key={s} className="relative flex gap-3 pb-4 last:pb-0">
            {i < steps.length - 1 && <span className={clsx('absolute left-[11px] top-6 h-[calc(100%-18px)] w-0.5', done && i < currentIdx ? 'bg-primary' : 'bg-line')} />}
            <span className={clsx('z-[1] flex h-6 w-6 shrink-0 items-center justify-center rounded-full', done ? 'bg-primary text-white' : 'border-2 border-line bg-card')}>
              {done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
            </span>
            <div className="-mt-0.5">
              <div className={clsx('text-[14px] font-semibold', done ? 'text-ink' : 'text-muted')}>{t(`status.${s}`)}</div>
              {time && <div className="text-[12px] text-muted">{timeOnly(time)}</div>}
            </div>
          </li>
        );
      })}
      {order.status === 'CANCELLED' && (
        <li className="relative flex gap-3 pt-3">
          <span className="z-[1] flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-danger text-white">
            <CircleX className="h-4 w-4" />
          </span>
          <div className="-mt-0.5">
            <div className="text-[14px] font-semibold text-danger">{t('status.CANCELLED')}</div>
            <div className="text-[12px] text-muted">{dateTime(order.cancelledAt)}</div>
            {order.cancelReason && <div className="mt-1 text-[13px] text-ink">{order.cancelReason}</div>}
          </div>
        </li>
      )}
    </ol>
  );
}

/** Mijoz/manzil bloki (xodimlar uchun) */
export function OrderContactBlock({ order }: { order: Order }) {
  const { t } = useTranslation();
  const tel = phoneHref(order.phone || order.customer?.phone);
  return (
    <div className="space-y-2.5 text-[14px]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[12px] font-semibold text-muted">{t('orders.customer')}</div>
          <div className="font-semibold text-ink">{personName(order.customer)}</div>
          <div className="text-muted">{prettyPhone(order.phone || order.customer?.phone)}</div>
        </div>
        {tel && (
          <a href={tel} className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary-soft px-3.5 text-[13px] font-bold text-primary-dark">
            <Phone className="h-4 w-4" /> {t('common.call')}
          </a>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Package className="h-4 w-4 text-primary-light" />
        <span className="font-semibold">{order.deliveryType === 'DELIVERY' ? t('orders.delivery') : t('orders.pickup')}</span>
      </div>
      {order.deliveryType === 'DELIVERY' && (
        <div className="flex gap-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary-light" />
          <div className="min-w-0">
            {order.address && <div className="text-ink">{order.address}</div>}
            {order.lat != null && order.lng != null && (
              <div className="mt-1 flex flex-wrap gap-2">
                <a className="text-[13px] font-bold text-primary underline" href={mapsLinks(order.lat, order.lng).google} target="_blank" rel="noreferrer">
                  Google Maps
                </a>
                <a className="text-[13px] font-bold text-primary underline" href={mapsLinks(order.lat, order.lng).yandex} target="_blank" rel="noreferrer">
                  Yandex Maps
                </a>
              </div>
            )}
          </div>
        </div>
      )}
      {order.comment && (
        <div className="rounded-xl bg-surface px-3 py-2 text-[13px] text-ink">
          <span className="font-semibold text-muted">{t('common.note')}: </span>
          {order.comment}
        </div>
      )}
    </div>
  );
}
