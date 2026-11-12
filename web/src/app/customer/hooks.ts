import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { get, post, put } from '../../shared/api';
import type { Cart, Product, PublicSettings } from '../../shared/types';
import { useToast } from '../../shared/ui';

export function useCart() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['cart'], queryFn: () => get<Cart>('/shop/cart'), staleTime: 30_000 });
  const m = useMutation({
    mutationFn: ({ productId, qty }: { productId: number; qty: number }) => put<Cart>(`/shop/cart/${productId}`, { qty }),
    onMutate: async ({ productId, qty }) => {
      await qc.cancelQueries({ queryKey: ['cart'] });
      const prev = qc.getQueryData<Cart>(['cart']);
      if (prev) {
        const items = prev.items
          .map((i) => (i.productId === productId ? { ...i, qty, lineTotal: Math.round(qty * i.product.price) } : i))
          .filter((i) => i.qty > 0);
        qc.setQueryData<Cart>(['cart'], { items, itemsTotal: items.reduce((s, i) => s + i.lineTotal, 0) });
      }
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['cart'], ctx.prev);
      toast.error(e);
    },
    onSuccess: (data) => qc.setQueryData(['cart'], data),
  });
  const items = q.data?.items ?? [];
  return {
    cart: q.data,
    isLoading: q.isLoading,
    items,
    count: items.length,
    total: q.data?.itemsTotal ?? 0,
    qtyOf: (productId: number) => items.find((i) => i.productId === productId)?.qty ?? 0,
    setQty: (productId: number, qty: number) => m.mutateAsync({ productId, qty }),
    refetch: q.refetch,
  };
}

export function useFavorites() {
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['fav-ids'], queryFn: () => get<number[]>('/shop/favorites/ids'), staleTime: 60_000 });
  const ids = new Set(q.data ?? []);
  const toggle = async (productId: number) => {
    const was = ids.has(productId);
    qc.setQueryData<number[]>(['fav-ids'], (old = []) => (was ? old.filter((x) => x !== productId) : [...old, productId]));
    try {
      await post(`/shop/favorites/${productId}`);
      toast.info(was ? t('product.favRemoved') : t('product.favAdded'));
      void qc.invalidateQueries({ queryKey: ['favorites'] });
    } catch (e) {
      void qc.invalidateQueries({ queryKey: ['fav-ids'] });
      toast.error(e);
    }
  };
  return { isFav: (id: number) => ids.has(id), toggle };
}

export function useShopSettings() {
  return useQuery({ queryKey: ['shop-settings'], queryFn: () => get<PublicSettings>('/catalog/settings'), staleTime: 60_000 });
}

export type { Product };
