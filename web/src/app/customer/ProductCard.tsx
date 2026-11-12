import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Heart, Plus } from 'lucide-react';
import type { Product } from '../../shared/types';
import { Badge, Skeleton, Stepper, clsx } from '../../shared/ui';
import { money, nameOf, unitLabel } from '../../shared/format';
import { ProductThumb } from '../../shared/orderParts';
import { haptic } from '../../shared/telegram';
import { useCart, useFavorites } from './hooks';

export function ProductCard({ p }: { p: Product }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const cart = useCart();
  const fav = useFavorites();
  const inCart = cart.qtyOf(p.id);
  const isFav = fav.isFav(p.id);

  return (
    <div className="card flex flex-col overflow-hidden">
      <div className="relative cursor-pointer" onClick={() => navigate(`/product/${p.id}`)}>
        <ProductThumb url={p.image?.thumbUrl} className="aspect-square w-full" alt={nameOf(p)} />
        <div className="absolute left-2 top-2 flex flex-col gap-1">
          {p.discountPercent > 0 && <Badge tone="accent">-{p.discountPercent}%</Badge>}
          {p.isNew && <Badge tone="primary">{t('shop.new')}</Badge>}
        </div>
        <button
          aria-label="favorite"
          onClick={(e) => {
            e.stopPropagation();
            haptic('light');
            void fav.toggle(p.id);
          }}
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-card"
        >
          <Heart className={clsx('h-[17px] w-[17px]', isFav ? 'fill-danger text-danger' : 'text-muted')} />
        </button>
        {!p.inStock && (
          <div className="absolute inset-x-0 bottom-0 bg-ink/60 py-1 text-center text-[11px] font-bold text-white">{t('product.outOfStock')}</div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3 pt-2.5">
        <div className="line-clamp-2 min-h-[38px] cursor-pointer text-[13.5px] font-semibold leading-[19px] text-ink" onClick={() => navigate(`/product/${p.id}`)}>
          {nameOf(p)}
        </div>
        <div className="mt-auto flex items-end justify-between gap-1 pt-2">
          <div className="min-w-0">
            {p.oldPrice && p.oldPrice > p.price && <div className="text-[11px] text-muted line-through">{money(p.oldPrice)}</div>}
            <div className="text-[14.5px] font-extrabold leading-tight text-primary">{money(p.price)}</div>
            <div className="text-[11px] font-medium text-muted">/ {unitLabel(p.unit)}</div>
          </div>
          {p.inStock &&
            (inCart > 0 ? (
              <Stepper size="sm" value={inCart} step={p.step} min={p.minQty} max={p.stock} onChange={(v) => void cart.setQty(p.id, v)} />
            ) : (
              <button
                aria-label={t('product.addToCart')}
                onClick={() => {
                  haptic('medium');
                  void cart.setQty(p.id, p.minQty);
                }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-card active:scale-90"
              >
                <Plus className="h-5 w-5" strokeWidth={2.6} />
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}

export function ProductGrid({ items }: { items: Product[] }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map((p) => (
        <ProductCard key={p.id} p={p} />
      ))}
    </div>
  );
}

export function ProductGridSkeleton({ n = 6 }: { n?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="card overflow-hidden">
          <Skeleton className="aspect-square w-full rounded-none" />
          <div className="space-y-2 p-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-5 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
