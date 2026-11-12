import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Heart, ImageOff, Info, ShoppingCart, Zap } from 'lucide-react';
import { get } from '../../shared/api';
import type { Product } from '../../shared/types';
import { Badge, Button, ErrorState, IconButton, PageLoader, SectionTitle, Stepper, clsx, useToast } from '../../shared/ui';
import { descOf, isWeighted, money, nameOf, unitLabel } from '../../shared/format';
import { haptic } from '../../shared/telegram';
import { PageHeader } from '../layout';
import { useCart, useFavorites } from './hooks';
import { ProductCard } from './ProductCard';

export function ProductPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const cart = useCart();
  const fav = useFavorites();
  const q = useQuery({ queryKey: ['product', id], queryFn: () => get<Product>(`/catalog/products/${id}`) });
  const [qty, setQty] = useState(0);
  const [slide, setSlide] = useState(0);
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const p = q.data;
  const inCart = p ? cart.qtyOf(p.id) : 0;

  useEffect(() => {
    if (p) setQty(inCart || p.minQty);
  }, [p?.id, inCart]);

  if (q.isLoading) return <PageLoader />;
  if (q.error || !p) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  const images = p.images.length ? p.images : [];
  const goTo = (i: number) => {
    setSlide(i);
    scroller.current?.scrollTo({ left: i * scroller.current.clientWidth, behavior: 'smooth' });
  };
  const stockState = !p.inStock ? 'out' : p.isLow ? 'low' : 'in';

  const addToCart = async (thenCheckout: boolean) => {
    if (!qty) return;
    setBusy(true);
    try {
      await cart.setQty(p.id, qty);
      haptic('success');
      if (thenCheckout) navigate('/checkout');
      else toast.success(t('product.added'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fade-in mx-auto max-w-xl" style={{ paddingBottom: 'calc(var(--safe-bottom) + 96px)' }}>
      <PageHeader
        title={nameOf(p)}
        right={<IconButton icon={Heart} label="favorite" onClick={() => fav.toggle(p.id)} className={clsx(fav.isFav(p.id) && '[&>svg]:fill-danger [&>svg]:text-danger')} />}
      />

      {/* Karusel */}
      <div className="relative bg-surface">
        {images.length ? (
          <div
            ref={scroller}
            className="no-scrollbar flex aspect-square snap-x snap-mandatory overflow-x-auto"
            onScroll={(e) => {
              const el = e.currentTarget;
              setSlide(Math.round(el.scrollLeft / el.clientWidth));
            }}
          >
            {images.map((img) => (
              <img key={img.id} src={img.url} alt={nameOf(p)} className="h-full w-full shrink-0 snap-center object-cover" />
            ))}
          </div>
        ) : (
          <div className="flex aspect-square items-center justify-center">
            <ImageOff className="h-16 w-16 text-line" />
          </div>
        )}
        <div className="absolute left-3 top-3 flex flex-col gap-1">
          {p.discountPercent > 0 && <Badge tone="accent">-{p.discountPercent}%</Badge>}
          {p.isNew && <Badge tone="primary">{t('shop.new')}</Badge>}
        </div>
      </div>
      {images.length > 1 && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pt-3">
          {images.map((img, i) => (
            <button key={img.id} onClick={() => goTo(i)} className={clsx('h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2', slide === i ? 'border-primary' : 'border-transparent')}>
              <img src={img.thumbUrl} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <div className="space-y-4 px-4 pt-4">
        <div>
          <h1 className="font-display text-[25px] font-bold leading-tight text-ink">{nameOf(p)}</h1>
          <div className="mt-1 text-[13px] text-muted">{nameOf(p.category)}</div>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div>
            {p.oldPrice && p.oldPrice > p.price && <div className="text-[14px] text-muted line-through">{money(p.oldPrice)}</div>}
            <div className="font-display text-[27px] font-bold text-primary">
              {money(p.price)} <span className="text-[15px] font-semibold text-muted">/ {unitLabel(p.unit)}</span>
            </div>
          </div>
          <Badge tone={stockState === 'out' ? 'danger' : stockState === 'low' ? 'warning' : 'success'}>
            {stockState === 'out' ? t('product.outOfStock') : stockState === 'low' ? t('product.lowStock') : t('product.inStock')}
          </Badge>
        </div>

        {isWeighted(p.unit) && (
          <div className="flex gap-2.5 rounded-2xl bg-primary-soft p-3 text-[13px] text-primary-dark">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            {t('product.approx')}
          </div>
        )}

        {p.inStock && (
          <div className="flex items-center justify-between rounded-2xl border border-line p-3">
            <div>
              <div className="text-[13px] font-semibold text-muted">{t('product.qty')}</div>
              <div className="text-[15px] font-bold text-ink">{money(Math.round(qty * p.price))}</div>
            </div>
            <Stepper value={qty} step={p.step} min={p.minQty} max={p.stock} suffix={unitLabel(p.unit)} onChange={(v) => setQty(v < p.minQty ? p.minQty : v)} />
          </div>
        )}

        {descOf(p) && (
          <div>
            <h3 className="mb-1.5 text-[15px] font-bold text-ink">{t('product.description')}</h3>
            <p className="whitespace-pre-line text-[14px] leading-relaxed text-ink/80">{descOf(p)}</p>
          </div>
        )}

        {!!p.similar?.length && (
          <div className="pt-2">
            <SectionTitle title={t('product.similar')} />
            <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
              {p.similar.map((s) => (
                <div key={s.id} className="w-[46%] shrink-0">
                  <ProductCard p={s} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {p.inStock && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card px-4 pt-3" style={{ paddingBottom: 'calc(var(--safe-bottom) + 12px)' }}>
          <div className="mx-auto flex max-w-xl gap-2">
            <Button variant="secondary" size="lg" className="shrink-0 whitespace-nowrap px-3 text-[13.5px]" icon={ShoppingCart} loading={busy} onClick={() => addToCart(false)}>
              {inCart ? t('product.inCart') : t('product.addToCart')}
            </Button>
            <Button size="lg" block className="min-w-0 whitespace-nowrap px-3 text-[13.5px]" disabled={busy} onClick={() => addToCart(true)}>
              <Zap className="hidden h-[18px] w-[18px] min-[400px]:block" />
              {t('product.buyNow')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
