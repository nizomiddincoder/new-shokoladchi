import { Suspense, lazy, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ban, Send, Smartphone } from 'lucide-react';
import { get } from '../shared/api';
import type { Me } from '../shared/types';
import { setLanguage } from '../shared/i18n';
import { closeApp, insideTelegramWithoutData, isTelegram, openBot } from '../shared/telegram';
import { Button, Empty, ErrorState, PageLoader } from '../shared/ui';
import { CustomerApp } from './customer/CustomerApp';
import { MeContext } from './meContext';

// Xodim va admin qismlari alohida yuklanadi (mijoz uchun ilova yengil bo'lsin)
const SellerApp = lazy(() => import('./staff/SellerApp').then((m) => ({ default: m.SellerApp })));
const WarehouseApp = lazy(() => import('./staff/WarehouseApp').then((m) => ({ default: m.WarehouseApp })));
const AdminMiniApp = lazy(() => import('./staff/AdminMiniApp').then((m) => ({ default: m.AdminMiniApp })));

export function App() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: () => get<Me>('/auth/me'), enabled: isTelegram, staleTime: 60_000 });

  // Bosh sahifa ma'lumoti /auth/me bilan bir vaqtda so'raladi (ketma-ket kutmasdan)
  useEffect(() => {
    if (isTelegram) void qc.prefetchQuery({ queryKey: ['home'], queryFn: () => get('/catalog/home'), staleTime: 15_000 });
  }, [qc]);

  useEffect(() => {
    if (me.data?.kind === 'tg' && me.data.language) setLanguage(me.data.language);
  }, [me.data]);

  if (!isTelegram) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        {insideTelegramWithoutData ? (
          <Empty
            icon={Send}
            title={t('gate.reopenTitle')}
            text={t('gate.reopenText')}
            action={<Button onClick={closeApp}>{t('gate.backToBot')}</Button>}
          />
        ) : (
          <Empty
            icon={Smartphone}
            title={t('gate.openInTelegram')}
            text={t('gate.openInTelegramText')}
            action={
              <a href="/admin/" className="text-[14px] font-bold text-primary underline">
                {t('admin.title')}
              </a>
            }
          />
        )}
      </div>
    );
  }
  if (me.isLoading) return <PageLoader />;
  if (me.error || !me.data) return <ErrorState error={me.error} onRetry={() => me.refetch()} />;
  const m = me.data;
  if (m.kind !== 'tg') return null;

  if (!m.registered) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Empty
          icon={Send}
          title={t('gate.notRegisteredTitle')}
          text={t('gate.notRegisteredText')}
          action={<Button onClick={openBot}>{t('gate.backToBot')}</Button>}
        />
      </div>
    );
  }
  if (m.blocked) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Empty icon={Ban} title={t('gate.blockedTitle')} text={t('gate.blockedText')} action={<Button onClick={openBot}>{t('gate.backToBot')}</Button>} />
      </div>
    );
  }

  return (
    <MeContext.Provider value={m}>
      <Suspense fallback={<PageLoader />}>
      {m.role === 'SELLER' ? (
        <SellerApp />
      ) : m.role === 'WAREHOUSE' ? (
        <WarehouseApp />
      ) : m.role === 'ADMIN' ? (
        <AdminMiniApp />
      ) : (
        <CustomerApp />
      )}
      </Suspense>
    </MeContext.Provider>
  );
}
