import { useQuery } from '@tanstack/react-query';
import { Store } from 'lucide-react';
import { get } from './api';
import { clsx } from './ui';

export type Branding = { shopName: string; logoUrl: string | null };

/** Do'kon nomi va logosi (avtorizatsiyasiz ochiq so'rov — login sahifasida ham kerak) */
export function useBranding() {
  return useQuery({ queryKey: ['branding'], queryFn: () => get<Branding>('/public/branding'), staleTime: 5 * 60_000 });
}

/** Do'kon logosi: yuklangan bo'lsa rasm, aks holda shokolad rangli belgi */
export function ShopLogo({ url, className, iconClassName }: { url?: string | null; className?: string; iconClassName?: string }) {
  if (url) {
    return <img src={url} alt="logo" className={clsx('shrink-0 rounded-2xl bg-card object-contain', className)} />;
  }
  return (
    <span className={clsx('flex shrink-0 items-center justify-center rounded-2xl bg-primary text-white', className)}>
      <Store className={clsx('h-1/2 w-1/2', iconClassName)} />
    </span>
  );
}
