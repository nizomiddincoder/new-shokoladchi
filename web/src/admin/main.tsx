import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, NavLink, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Languages, LockKeyhole, LogOut, Menu, Moon, Sun, X } from 'lucide-react';
import '../shared/styles.css';
import { applyTheme, useTheme } from '../shared/theme';
import { ShopLogo, useBranding, useBrandingFavicon } from '../shared/branding';
import i18n, { setLanguage } from '../shared/i18n';
import { ApiError, get, post, setUnauthorizedHandler } from '../shared/api';
import type { Me } from '../shared/types';
import { Button, Field, PageLoader, ToastProvider, clsx } from '../shared/ui';
import { AdminCtx } from '../adminPages/common';
import { ADMIN_MENU, AdminRoutes } from '../adminPages/routes';

applyTheme();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: (n, e) => !(e instanceof ApiError && (e.status === 401 || e.status === 403)) && n < 1, staleTime: 15_000, refetchOnWindowFocus: false } },
});

function Login({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const branding = useBranding();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await post('/auth/web/login', { login, password });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6">
        <div className="flex flex-col items-center gap-2 pb-2">
          {branding.data?.logoUrl ? (
            <ShopLogo url={branding.data.logoUrl} className="h-16 w-16" />
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white">
              <LockKeyhole className="h-7 w-7" />
            </span>
          )}
          {branding.data?.shopName && <div className="font-display text-[22px] font-bold text-primary-dark">{branding.data.shopName}</div>}
          <h1 className="text-[15px] font-semibold text-muted">{t('admin.loginTitle')}</h1>
        </div>
        <Field label={t('admin.login')}>
          <input className="input" autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} autoFocus />
        </Field>
        <Field label={t('admin.password')}>
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <div className="rounded-xl bg-danger-soft p-3 text-[13px] font-semibold text-danger">{error}</div>}
        <Button type="submit" block size="lg" loading={busy} disabled={!login || !password}>
          {t('admin.signIn')}
        </Button>
      </form>
    </div>
  );
}

function Sidebar({ onNavigate, onLogout }: { onNavigate?: () => void; onLogout: () => void }) {
  const { t } = useTranslation();
  const lang = i18n.language === 'ru' ? 'ru' : 'uz';
  const branding = useBranding();
  useBrandingFavicon(branding.data?.logoUrl);
  const { theme, toggle } = useTheme();
  const iconBtn = 'flex h-10 w-10 items-center justify-center rounded-xl text-ink transition hover:bg-primary-soft';
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2.5 px-4 py-4">
        <ShopLogo url={branding.data?.logoUrl} className="h-11 w-11" />
        <div className="min-w-0">
          <div className="truncate font-display text-[18px] font-bold text-primary-dark">{branding.data?.shopName || t('admin.title')}</div>
          <div className="text-[11px] font-semibold text-muted">{t('admin.title')}</div>
        </div>
      </div>
      {/* Menyu aylantirilmaydi: barcha bo'limlar bir ekranga sig'adi */}
      <nav className="no-scrollbar flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3">
        {ADMIN_MENU.map((m) => (
          <NavLink
            key={m.to}
            to={m.to}
            end={m.to === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              clsx(
                'flex shrink-0 items-center gap-3 rounded-xl px-3 py-[7px] text-[14px] font-semibold transition',
                isActive ? 'bg-primary text-white' : 'text-ink hover:bg-primary-soft',
              )
            }
          >
            <m.icon className="h-[18px] w-[18px]" />
            {t(m.key)}
          </NavLink>
        ))}
      </nav>
      <div className="flex shrink-0 items-center gap-1 border-t border-line px-3 py-2.5">
        <button
          onClick={toggle}
          className={iconBtn}
          title={theme === 'dark' ? t('theme.light') : t('theme.dark')}
          aria-label={theme === 'dark' ? t('theme.light') : t('theme.dark')}
        >
          {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
        <button
          onClick={() => setLanguage(lang === 'uz' ? 'ru' : 'uz')}
          className={iconBtn}
          title={lang === 'uz' ? 'Русский' : "O'zbekcha"}
          aria-label={lang === 'uz' ? 'Русский' : "O'zbekcha"}
        >
          <Languages className="h-5 w-5" />
        </button>
        <button
          onClick={onLogout}
          className="ml-auto flex h-10 w-10 items-center justify-center rounded-xl text-danger transition hover:bg-danger-soft"
          title={t('common.logout')}
          aria-label={t('common.logout')}
        >
          <LogOut className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

function MobileBrand() {
  const branding = useBranding();
  return (
    <span className="flex min-w-0 items-center gap-2">
      <ShopLogo url={branding.data?.logoUrl} className="h-8 w-8 rounded-xl" />
      <span className="truncate font-extrabold text-primary-dark">{branding.data?.shopName || 'Admin'}</span>
    </span>
  );
}

function AdminWeb() {
  const qc = useQueryClient();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const me = useQuery({ queryKey: ['web-me'], queryFn: () => get<Me>('/auth/me'), retry: false });

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void qc.invalidateQueries({ queryKey: ['web-me'] });
    });
  }, [qc]);
  useEffect(() => setMobileOpen(false), [location.pathname]);

  const logout = async () => {
    await post('/auth/web/logout').catch(() => undefined);
    qc.clear();
    void me.refetch();
  };

  if (me.isLoading) return <PageLoader />;
  if (me.error || !me.data || me.data.kind !== 'web') {
    return (
      <Login
        onDone={() => {
          qc.clear();
          void me.refetch();
        }}
      />
    );
  }

  return (
    <AdminCtx.Provider value={{ isWeb: true }}>
      <div className="min-h-screen bg-surface">
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-line bg-card lg:block">
          <Sidebar onLogout={logout} />
        </aside>
        {mobileOpen && (
          <div className="fixed inset-0 z-50 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)}>
            <aside className="relative h-full w-72 bg-card" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setMobileOpen(false)} className="absolute right-2 top-2 z-10 p-2" aria-label="close"><X className="h-5 w-5" /></button>
              <Sidebar onNavigate={() => setMobileOpen(false)} onLogout={logout} />
            </aside>
          </div>
        )}
        <div className="lg:pl-64">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-card px-4 lg:hidden">
            <button onClick={() => setMobileOpen(true)} className="-ml-2 p-2" aria-label="menu"><Menu className="h-6 w-6" /></button>
            <MobileBrand />
          </header>
          <main className="mx-auto max-w-7xl p-4 md:p-6 lg:p-8">
            <AdminRoutes />
          </main>
        </div>
      </div>
    </AdminCtx.Provider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter basename="/admin">
          <AdminWeb />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
