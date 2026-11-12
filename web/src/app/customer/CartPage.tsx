import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ShoppingCart, Trash2, Truck } from 'lucide-react';
import { Button, Card, Empty, PageLoader, Stepper, useToast } from '../../shared/ui';
import { isWeighted, money, nameOf, unitLabel } from '../../shared/format';
import { ProductThumb } from '../../shared/orderParts';
import { useMainButton } from '../../shared/telegram';
import { Screen, TopTitle } from '../layout';
import { useCart, useShopSettings } from './hooks';

export function CartPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const cart = useCart();
  const settings = useShopSettings();
  const s = settings.data;
  const total = cart.total;
  const minLeft = s ? Math.max(0, s.minOrderAmount - total) : 0;
  const hasUnavailable = cart.items.some((i) => !i.available);
  const canCheckout = cart.count > 0 && minLeft === 0 && !hasUnavailable;
  const approx = cart.items.some((i) => isWeighted(i.product.unit));

  // Tugma o'chirilmaydi: sabab bo'lsa, mijozga aytiladi
  const goCheckout = () => {
    if (canCheckout) return navigate('/checkout');
    if (hasUnavailable) toast.error(new Error(t('cart.unavailable')));
    else if (s && minLeft > 0) toast.error(new Error(t('cart.minOrder', { sum: money(s.minOrderAmount), left: money(minLeft) })));
  };

  useMainButton({
    text: `${t('cart.checkout')} · ${money(total)}`,
    onClick: goCheckout,
    visible: cart.count > 0,
  });

  if (cart.isLoading) return <PageLoader />;

  return (
    <Screen>
      <TopTitle
        title={t('cart.title')}
        right={
          cart.count > 0 && (
            <button className="text-[13px] font-bold text-danger" onClick={() => cart.items.forEach((i) => void cart.setQty(i.productId, 0))}>
              {t('cart.clear')}
            </button>
          )
        }
      />
      {cart.count === 0 ? (
        <Empty icon={ShoppingCart} title={t('cart.empty')} text={t('cart.emptyText')} action={<Button onClick={() => navigate('/catalog')}>{t('cart.goCatalog')}</Button>} />
      ) : (
        <div className="space-y-3 px-4">
          {cart.items.map((it) => (
            <Card key={it.productId} className="flex gap-3 p-3">
              <ProductThumb url={it.product.image?.thumbUrl} className="h-20 w-20 cursor-pointer rounded-xl" />
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-start justify-between gap-2">
                  <button className="line-clamp-2 text-left text-[14px] font-semibold leading-snug text-ink" onClick={() => navigate(`/product/${it.productId}`)}>
                    {nameOf(it.product)}
                  </button>
                  <button aria-label={t('common.delete')} onClick={() => void cart.setQty(it.productId, 0)} className="-mr-1 -mt-1 p-1.5 text-muted">
                    <Trash2 className="h-[18px] w-[18px]" />
                  </button>
                </div>
                <div className="text-[12px] text-muted">
                  {money(it.product.price)} / {unitLabel(it.product.unit)}
                </div>
                {!it.available && <div className="text-[12px] font-semibold text-danger">{t('cart.unavailable')}</div>}
                <div className="mt-auto flex items-center justify-between pt-1.5">
                  <Stepper size="sm" value={it.qty} step={it.product.step} min={it.product.minQty} max={it.product.stock} suffix={unitLabel(it.product.unit)} onChange={(v) => void cart.setQty(it.productId, v)} />
                  <div className="text-right text-[15px] font-extrabold text-primary">{money(it.lineTotal)}</div>
                </div>
              </div>
            </Card>
          ))}

          <Card className="space-y-2 p-4 text-[14px]">
            <div className="flex justify-between">
              <span className="text-muted">{t('cart.items')}</span>
              <span className="font-bold">{money(total)}{approx && <span className="ml-1 text-[11px] font-semibold text-muted">({t('cart.approxTotal')})</span>}</span>
            </div>
            {s && (
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-muted"><Truck className="h-4 w-4" />{t('cart.delivery')}</span>
                <span className="font-semibold">{s.freeDeliveryFrom > 0 && total >= s.freeDeliveryFrom ? t('cart.deliveryFree') : money(s.deliveryFee)}</span>
              </div>
            )}
            {s && s.freeDeliveryFrom > 0 && total < s.freeDeliveryFrom && <div className="text-[12px] text-muted">{t('cart.freeFrom', { sum: money(s.freeDeliveryFrom) })}</div>}
          </Card>

          {minLeft > 0 && s && (
            <div className="flex gap-2.5 rounded-2xl bg-[#FCF1E3] p-3 text-[13px] font-semibold text-[#A86A1E]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {t('cart.minOrder', { sum: money(s.minOrderAmount), left: money(minLeft) })}
            </div>
          )}

          <Button block size="lg" onClick={goCheckout}>
            {t('cart.checkout')} · {money(total)}
          </Button>
        </div>
      )}
    </Screen>
  );
}
