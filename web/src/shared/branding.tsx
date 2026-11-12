import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Store } from 'lucide-react';
import { get } from './api';
import { clsx } from './ui';

export type Branding = { shopName: string; logoUrl: string | null };

/** Do'kon nomi va logosi (avtorizatsiyasiz ochiq so'rov — login sahifasida ham kerak) */
export function useBranding() {
  return useQuery({ queryKey: ['branding'], queryFn: () => get<Branding>('/public/branding'), staleTime: 60_000, refetchOnWindowFocus: true });
}

/** Brauzer tabidagi ikonka (favicon) ni do'kon logosiga almashtiradi */
export function useBrandingFavicon(logoUrl: string | null | undefined) {
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) return;
    if (logoUrl) {
      link.type = '';
      link.href = logoUrl;
    } else {
      link.type = 'image/svg+xml';
      link.href = '/favicon.svg';
    }
  }, [logoUrl]);
}

/** Do'kon logosi: yuklangan bo'lsa rasm, aks holda shokolad rangli belgi */
export function ShopLogo({ url, className, iconClassName }: { url?: string | null; className?: string; iconClassName?: string }) {
  if (url) {
    return <img key={url} src={url} alt="logo" className={clsx('shrink-0 rounded-2xl bg-card object-contain', className)} />;
  }
  return (
    <span className={clsx('flex shrink-0 items-center justify-center rounded-2xl bg-primary text-white', className)}>
      <Store className={clsx('h-1/2 w-1/2', iconClassName)} />
    </span>
  );
}
