import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Camera, Clock, Gift, Search } from 'lucide-react';
import { get } from '../../shared/api';
import type { Banner, Category, Product, PublicSettings } from '../../shared/types';
import { ErrorState, SectionTitle, Skeleton, ThemeToggle } from '../../shared/ui';
import { CategoryVisual } from '../../shared/icons';
import { ShopLogo } from '../../shared/branding';
import { nameOf } from '../../shared/format';
import { useBackButton } from '../../shared/telegram';
import { Screen } from '../layout';
import { ProductCard, ProductGrid, ProductGridSkeleton } from './ProductCard';

type Home = { banners: Banner[]; categories: Category[]; discounted: Product[]; bestsellers: Product[]; newest: Product[]; settings: PublicSettings; personalCount: number };

export function HomePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  useBackButton(null);
  const q = useQuery({ queryKey: ['home'], queryFn: () => get<Home>('/catalog/home') });
  const d = q.data;

  const openBanner = (b: Banner) => {
    if (b.linkType === 'CATEGORY' && b.linkId) navigate(`/catalog?category=${b.linkId}`);
    else if (b.linkType === 'PRODUCT' && b.linkId) navigate(`/product/${b.linkId}`);
  };

  return (
    <Screen>
      <div className="px-4 pt-4">
        <div className="mb-3 flex items-center gap-2.5">
          <ShopLogo url={d?.settings.logoUrl} className="h-11 w-11" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-[22px] font-bold leading-tight text-primary-dark">{d?.settings.shopName || ' '}</div>
            {d && (
              <div className="flex items-center gap-1 text-[12px] font-medium text-muted">
                <Clock className="h-3.5 w-3.5" />
                {d.settings.isOpen ? t('shop.workHours', { start: d.settings.workHoursStart, end: d.settings.workHoursEnd }) : t('shop.closed')}
              </div>
            )}
          </div>
          <ThemeToggle />
        </div>
        <button onClick={() => navigate('/search')} className="flex h-12 w-full items-center gap-2.5 rounded-2xl border border-line bg-surface px-4 text-left text-[15px] text-muted">
          <Search className="h-5 w-5" />
          {t('shop.searchPlaceholder')}
        </button>
      </div>

      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}

      {/* "Mening shokoladim" — maxsus, ajralib turadigan tugma */}
      {!!d?.personalCount && (
        <div className="px-4 pt-4">
          <button
            onClick={() => navigate('/personal')}
            className="relative flex w-full items-center gap-3.5 overflow-hidden rounded-3xl bg-gradient-to-r from-[#4A3224] via-[#6F4E37] to-[#C98E55] p-4 text-left text-white shadow-lift active:scale-[0.99]"
          >
            <span className="absolute -right-6 -top-8 h-28 w-28 rounded-full bg-white/10" />
            <span className="absolute -bottom-10 right-10 h-20 w-20 rounded-full bg-white/10" />
            <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20">
              <Gift className="h-7 w-7" />
            </span>
            <span className="relative min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="font-display text-[20px] font-bold leading-tight">{t('personal.title')}</span>
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-extrabold uppercase text-primary">{t('shop.new')}</span>
              </span>
              <span className="mt-0.5 block text-[12.5px] leading-snug opacity-90">{t('personal.homeText')}</span>
            </span>
            <Camera className="relative h-6 w-6 shrink-0 opacity-90" />
          </button>
        </div>
      )}

      {/* Bannerlar */}
      <div className="no-scrollbar mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4">
        {q.isLoading && <Skeleton className="aspect-[2.2/1] w-[88%] shrink-0 rounded-2xl" />}
        {d?.banners.map((b) => (
          <button key={b.id} onClick={() => openBanner(b)} className="relative aspect-[2.2/1] w-[88%] shrink-0 snap-center overflow-hidden rounded-2xl bg-primary-soft">
            <img src={b.imageUrl} alt="" className="h-full w-full object-cover" />
            {(i18n.language === 'ru' ? b.titleRu : b.titleUz) && (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-4 pb-3 pt-8 text-left text-[16px] font-bold text-white">
                {i18n.language === 'ru' ? b.titleRu : b.titleUz}
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Kategoriyalar */}
      <section className="mt-5 px-4">
        <SectionTitle title={t('shop.categories')} action={<button onClick={() => navigate('/catalog')} className="text-[13px] font-bold text-primary">{t('shop.seeAll')}</button>} />
        <div className="grid grid-cols-4 gap-x-2 gap-y-3">
          {q.isLoading &&
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <Skeleton className="h-16 w-16 rounded-2xl" />
                <Skeleton className="h-3 w-12" />
              </div>
            ))}
          {d?.categories.map((c) => (
            <button key={c.id} onClick={() => navigate(`/catalog?category=${c.id}`)} className="flex flex-col items-center gap-1.5">
              <CategoryVisual cat={c} className="h-16 w-16 rounded-2xl shadow-card" />
              <span className="line-clamp-2 text-center text-[11.5px] font-semibold leading-tight text-ink">{nameOf(c)}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Chegirmadagilar */}
      {(q.isLoading || !!d?.discounted.length) && (
        <section className="mt-6">
          <div className="px-4">
            <SectionTitle title={t('shop.discounted')} action={<button onClick={() => navigate('/catalog?discounted=1')} className="text-[13px] font-bold text-primary">{t('shop.seeAll')}</button>} />
          </div>
          <div className="no-scrollbar flex gap-3 overflow-x-auto px-4 pb-1">
            {d?.discounted.map((p) => (
              <div key={p.id} className="w-[46%] shrink-0">
                <ProductCard p={p} />
              </div>
            ))}
            {q.isLoading && <Skeleton className="h-60 w-[46%] shrink-0" />}
          </div>
        </section>
      )}

      {/* Ko'p sotilganlar */}
      <section className="mt-6 px-4">
        <SectionTitle title={t('shop.bestsellers')} />
        {q.isLoading ? <ProductGridSkeleton n={4} /> : <ProductGrid items={d?.bestsellers ?? []} />}
      </section>

      {!!d?.newest.length && (
        <section className="mt-6 px-4">
          <SectionTitle title={t('shop.newest')} />
          <ProductGrid items={d.newest} />
        </section>
      )}
    </Screen>
  );
}
