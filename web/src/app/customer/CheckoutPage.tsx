import { useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Info, LocateFixed, MapPin, Phone, Store, Truck } from 'lucide-react';
import { post } from '../../shared/api';
import type { DeliveryType } from '../../shared/types';
import { Button, Card, Field, PageLoader, Segmented, useToast } from '../../shared/ui';
import { MapView } from '../../shared/MapView';
import { isWeighted, money, prettyPhone, qty as fq, unitLabel, nameOf } from '../../shared/format';
import { isTelegram, openLocationSettings, requestLocation, useMainButton } from '../../shared/telegram';
import { PageHeader } from '../layout';
import { useMe } from '../meContext';
import { useCart, useShopSettings } from './hooks';
import type { PersonalCheckoutState } from './PersonalPage';

/** personal berilsa — "Mening shokoladim" buyurtmasi (savatcha emas) */
export function CheckoutPage({ personal }: { personal?: PersonalCheckoutState }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const me = useMe();
  const cart = useCart();
  const settings = useShopSettings();
  const [type, setType] = useState<DeliveryType>('DELIVERY');
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locBusy, setLocBusy] = useState(false);
  const [locDenied, setLocDenied] = useState(false);
  const [address, setAddress] = useState('');
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [showNeedLoc, setShowNeedLoc] = useState(false);
  const locationRef = useRef<HTMLDivElement>(null);

  const s = settings.data;
  const itemsTotal = personal ? Math.round(personal.qty * personal.price) : cart.total;
  const deliveryFee = type === 'DELIVERY' && s ? (s.freeDeliveryFrom > 0 && itemsTotal >= s.freeDeliveryFrom ? 0 : s.deliveryFee) : 0;
  const total = itemsTotal + deliveryFee;
  const closed = s ? !s.isOpen : false;
  const needLoc = type === 'DELIVERY' && !loc && !address.trim();
  const approx = !personal && cart.items.some((i) => isWeighted(i.product.unit));

  /**
   * Buyurtma berib bo'lmasligi sababi (bo'lsa). Tugma o'chirib qo'yilmaydi —
   * aks holda Telegram'da bosilganda hech narsa bo'lmaydi va mijoz sababini bilmaydi.
   */
  const problem = (): string | null => {
    if (!s) return t('common.loading');
    if (closed) return t('checkout.closedNow', { start: s.workHoursStart, end: s.workHoursEnd });
    if (!personal && itemsTotal < s.minOrderAmount) return t('cart.minOrder', { sum: money(s.minOrderAmount), left: money(s.minOrderAmount - itemsTotal) });
    if (needLoc) return t('checkout.needLocation');
    return null;
  };

  const getLocation = async () => {
    setLocBusy(true);
    setLocDenied(false);
    try {
      const l = await requestLocation();
      setLoc(l);
      toast.success(t('checkout.locationReceived'));
    } catch (e) {
      if ((e as Error).message === 'DENIED') setLocDenied(true);
      else toast.error(new Error(t('checkout.locationError')));
    } finally {
      setLocBusy(false);
    }
  };

  const submit = async () => {
    if (sending || (!personal && !cart.count)) return;
    const p = problem();
    if (p) {
      toast.error(new Error(p));
      if (needLoc) {
        setShowNeedLoc(true);
        locationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }
    setSending(true);
    try {
      const res = await post<{ id: number; number: number }>(personal ? '/shop/personal-orders' : '/shop/orders', {
        ...(personal ? { templateId: personal.templateId, designUrl: personal.designUrl, qty: personal.qty } : {}),
        deliveryType: type,
        address: type === 'DELIVERY' ? address : undefined,
        lat: type === 'DELIVERY' ? loc?.lat ?? null : null,
        lng: type === 'DELIVERY' ? loc?.lng ?? null : null,
        comment,
      });
      toast.success(t('checkout.success', { number: res.number }));
      navigate(`/orders/${res.id}`, { replace: true });
      void qc.invalidateQueries({ queryKey: ['cart'] });
      void qc.invalidateQueries({ queryKey: ['orders'] });
    } catch (e) {
      toast.error(e);
      await qc.invalidateQueries({ queryKey: ['cart'] });
    } finally {
      setSending(false);
    }
  };

  useMainButton({ text: `${t('checkout.placeOrder')} · ${money(total)}`, onClick: submit, disabled: sending, loading: sending, visible: !!personal || cart.count > 0 });

  if (settings.isLoading || (!personal && cart.isLoading)) return <PageLoader />;
  if (!personal && !cart.count && !sending) return <Navigate to="/cart" replace />;

  return (
    <div className="fade-in mx-auto max-w-xl" style={{ paddingBottom: 'calc(var(--safe-bottom) + 32px)' }}>
      <PageHeader title={t('checkout.title')} />
      <div className="space-y-3 px-4 pt-3">
        {closed && s && (
          <div className="flex gap-2.5 rounded-2xl bg-danger-soft p-3 text-[13px] font-semibold text-danger">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {t('checkout.closedNow', { start: s.workHoursStart, end: s.workHoursEnd })}
          </div>
        )}

        <Segmented
          value={type}
          onChange={setType}
          items={[
            { value: 'DELIVERY', label: t('checkout.delivery'), icon: Truck },
            { value: 'PICKUP', label: t('checkout.pickup'), icon: Store },
          ]}
        />

        {type === 'DELIVERY' ? (
          <div ref={locationRef}>
          <Card className={showNeedLoc && needLoc ? 'space-y-3 p-4 ring-2 ring-danger' : 'space-y-3 p-4'}>
            <Button block variant={loc ? 'secondary' : 'primary'} icon={LocateFixed} loading={locBusy} onClick={getLocation}>
              {loc ? t('checkout.locationReceived') : t('checkout.sendLocation')}
            </Button>
            {locDenied && (
              <div className="flex items-start gap-2 rounded-xl bg-warning-soft p-3 text-[12.5px] font-medium text-warning">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  {t('checkout.locationDenied')}
                  {isTelegram && (
                    <button className="ml-1 font-bold underline" onClick={openLocationSettings}>
                      {t('checkout.openSettings')}
                    </button>
                  )}
                </div>
              </div>
            )}
            {/* Joylashuvni olib bo'lmasa ham (masalan Telegram Desktop) nuqtani xaritadan bosib tanlash mumkin */}
            <div className="text-[12px] text-muted">{t('checkout.pickOnMap')}</div>
            <MapView lat={loc?.lat} lng={loc?.lng} height={190} onPick={(lat, lng) => setLoc({ lat, lng })} />
            <Field label={t('checkout.addressNote')}>
              <textarea className="input min-h-[72px]" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={500} />
            </Field>
            {showNeedLoc && needLoc && <div className="text-[13px] font-semibold text-danger">{t('checkout.needLocation')}</div>}
          </Card>
          </div>
        ) : (
          <Card className="space-y-3 p-4">
            <div className="flex gap-2.5">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <div className="text-[12px] font-semibold text-muted">{t('checkout.shopAddress')}</div>
                <div className="text-[14px] font-semibold text-ink">{s?.shopAddress || '—'}</div>
                {s && <div className="text-[12px] text-muted">{t('shop.workHours', { start: s.workHoursStart, end: s.workHoursEnd })}</div>}
              </div>
            </div>
            {s?.shopLat != null && s?.shopLng != null && <MapView lat={s.shopLat} lng={s.shopLng} height={170} />}
          </Card>
        )}

        <Card className="space-y-3 p-4">
          <Field label={t('checkout.comment')}>
            <textarea className="input min-h-[64px]" placeholder={t('checkout.commentPlaceholder')} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} />
          </Field>
          <div className="flex items-center gap-2.5 text-[14px]">
            <Phone className="h-4 w-4 text-primary-light" />
            <span className="text-muted">{t('checkout.phone')}:</span>
            <span className="font-semibold">{prettyPhone(me.phone)}</span>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="mb-2 text-[15px] font-bold">{t('checkout.summary')}</h3>
          {personal && (
            <div className="mb-2 space-y-2">
              <img src={personal.previewUrl} alt="" className="w-full rounded-xl border border-line" />
              <div className="flex justify-between gap-2 text-[13.5px]">
                <span className="min-w-0 truncate text-ink">
                  {personal.title} <span className="text-muted">· {fq(personal.qty)} {unitLabel(personal.unit)}</span>
                </span>
                <span className="shrink-0 font-semibold">{money(itemsTotal)}</span>
              </div>
            </div>
          )}
          <div className="space-y-1.5 text-[13.5px]">
            {!personal && cart.items.map((i) => (
              <div key={i.productId} className="flex justify-between gap-2">
                <span className="min-w-0 truncate text-ink">
                  {nameOf(i.product)} <span className="text-muted">· {fq(i.qty)} {unitLabel(i.product.unit)}</span>
                </span>
                <span className="shrink-0 font-semibold">{money(i.lineTotal)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-1.5 border-t border-line pt-3 text-[14px]">
            <div className="flex justify-between text-muted">
              <span>{t('cart.items')}</span>
              <span>{money(itemsTotal)}</span>
            </div>
            {type === 'DELIVERY' && (
              <div className="flex justify-between text-muted">
                <span>{t('cart.delivery')}</span>
                <span>{deliveryFee ? money(deliveryFee) : t('cart.deliveryFree')}</span>
              </div>
            )}
            <div className="flex justify-between text-[17px] font-extrabold">
              <span>{t('common.total')}</span>
              <span className="text-primary">{money(total)}</span>
            </div>
            {approx && <div className="text-[12px] text-muted">{t('product.approx')}</div>}
          </div>
        </Card>

        <div className="flex items-center gap-2 rounded-2xl bg-primary-soft p-3 text-[13px] font-semibold text-primary-dark">
          <Info className="h-4 w-4 shrink-0" />
          {t('checkout.paymentNote')}
        </div>

        {/* Sahifa ichidagi tugma doim bor: Telegram pastki tugmasi ko'rinmaydigan klientlarda ham buyurtma berish mumkin */}
        <Button block size="lg" loading={sending} onClick={submit}>
          {t('checkout.placeOrder')} · {money(total)}
        </Button>
      </div>
    </div>
  );
}
