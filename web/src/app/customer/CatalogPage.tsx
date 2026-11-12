import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PackageSearch, Search, X } from 'lucide-react';
import { get, qs } from '../../shared/api';
import type { Category, Paged, Product } from '../../shared/types';
import { Empty, ErrorState, Tabs, clsx } from '../../shared/ui';
import { CategoryIcon } from '../../shared/icons';
import { nameOf } from '../../shared/format';
import { PageHeader, Screen, TopTitle } from '../layout';
import { ProductGrid, ProductGridSkeleton } from './ProductCard';

type Sort = 'popular' | 'new' | 'cheap' | 'expensive';

export function CatalogPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const categoryId = params.get('category') || '';
  const discounted = params.get('discounted') || '';
  const sort = (params.get('sort') as Sort) || 'popular';
  const cats = useQuery({ queryKey: ['categories'], queryFn: () => get<Category[]>('/catalog/categories') });
  const q = useQuery({
    queryKey: ['products', categoryId, sort, discounted],
    queryFn: () => get<Paged<Product>>(`/catalog/products${qs({ categoryId, sort, discounted, limit: 100 })}`),
  });

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k === 'category') next.delete('discounted');
    setParams(next, { replace: true });
  };

  return (
    <Screen>
      <TopTitle title={t('nav.catalog')} />
      <div className="sticky top-0 z-20 space-y-2.5 bg-card/95 pb-3 pt-1 backdrop-blur">
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-4">
          <button onClick={() => setParam('category', '')} className={clsx('chip', !categoryId && !discounted && 'chip-active')}>
            {t('common.all')}
          </button>
          {discounted && <button className="chip chip-active">{t('shop.discounted')}</button>}
          {cats.data?.map((c) => (
            <button key={c.id} onClick={() => setParam('category', String(c.id))} className={clsx('chip', categoryId === String(c.id) && 'chip-active')}>
              {c.imageUrl ? (
                <img src={c.imageUrl} alt="" className="-ml-2 h-6 w-6 rounded-full bg-white object-cover" />
              ) : (
                <CategoryIcon name={c.iconName} className="h-4 w-4" />
              )}
              {nameOf(c)}
            </button>
          ))}
        </div>
        <Tabs
          className="px-4"
          value={sort}
          onChange={(v) => setParam('sort', v === 'popular' ? '' : v)}
          items={[
            { value: 'popular', label: t('shop.sortPopular') },
            { value: 'new', label: t('shop.sortNew') },
            { value: 'cheap', label: t('shop.sortCheap') },
            { value: 'expensive', label: t('shop.sortExpensive') },
          ]}
        />
      </div>
      <div className="px-4">
        {q.isLoading ? (
          <ProductGridSkeleton />
        ) : q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : q.data?.items.length ? (
          <ProductGrid items={q.data.items} />
        ) : (
          <Empty icon={PackageSearch} title={t('shop.noProducts')} text={t('shop.noProductsText')} />
        )}
      </div>
    </Screen>
  );
}

export function SearchPage() {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const h = setTimeout(() => setDebounced(text.trim()), 300);
    return () => clearTimeout(h);
  }, [text]);
  const q = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => get<Paged<Product>>(`/catalog/products${qs({ q: debounced, limit: 60 })}`),
    enabled: debounced.length >= 2,
  });
  return (
    <Screen withNav={false}>
      <PageHeader title={t('common.search')} />
      <div className="px-4 pt-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
          <input autoFocus className="input h-12 rounded-2xl pl-11 pr-10" placeholder={t('shop.searchPlaceholder')} value={text} onChange={(e) => setText(e.target.value)} />
          {text && (
            <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" onClick={() => setText('')} aria-label="clear">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
        <div className="mt-4">
          {debounced.length < 2 ? null : q.isLoading ? (
            <ProductGridSkeleton n={4} />
          ) : q.data?.items.length ? (
            <ProductGrid items={q.data.items} />
          ) : (
            <Empty icon={PackageSearch} title={t('shop.noProducts')} text={t('shop.noProductsText')} />
          )}
        </div>
      </div>
    </Screen>
  );
}
