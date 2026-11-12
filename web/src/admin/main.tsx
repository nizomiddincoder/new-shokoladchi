import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, NavLink, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Languages, LockKeyhole, LogOut, Menu, Store, X } from 'lucide-react';
import '../shared/styles.css';
import i18n, { setLanguage } from '../shared/i18n';
import { ApiError, get, post, setUnauthorizedHandler } from '../shared/api';
import type { Me } from '../shared/types';
import { Button, Field, PageLoader, ToastProvider, clsx } from '../shared/ui';
import { AdminCtx } from '../adminPages/common';
import { ADMIN_MENU, AdminRoutes } from '../adminPages/routes';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: (n, e) => !(e instanceof ApiError && (e.status === 401 || e.status === 403)) && n < 1, staleTime: 15_000, refetchOnWindowFocus: false } },
});

function Login({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
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
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white">
            <LockKeyhole className="h-7 w-7" />
          </span>
          <h1 className="text-[20px] font-extrabold">{t('admin.loginTitle')}</h1>
        </div>
        <Field label={t('admin.login')}>
          <input className="input" autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} autoFocus />
        </Field>
        <Field label={t('admin.password')}>
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <div className="rounded-xl bg-[#FBEAE8] p-3 text-[13px] font-semibold text-danger">{error}</div>}
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
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white">
          <Store className="h-5 w-5" />
        </span>
        <span className="text-[17px] font-extrabold text-primary-dark">{t('admin.title')}</span>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {ADMIN_MENU.map((m) => (
          <NavLink
            key={m.to}
            to={m.to}
            end={m.to === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              clsx('flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-semibold transition', isActive ? 'bg-primary text-white' : 'text-ink hover:bg-primary-soft')
            }
          >
            <m.icon className="h-[18px] w-[18px]" />
            {t(m.key)}
          </NavLink>
        ))}
      </nav>
      <div className="space-y-1 border-t border-line p-3">
        <button onClick={() => setLanguage(lang === 'uz' ? 'ru' : 'uz')} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-semibold hover:bg-primary-soft">
          <Languages className="h-[18px] w-[18px]" />
          {lang === 'uz' ? 'Русский' : "O'zbekcha"}
        </button>
        <button onClick={onLogout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-semibold text-danger hover:bg-[#FBEAE8]">
          <LogOut className="h-[18px] w-[18px]" />
          {t('common.logout')}
        </button>
      </div>
    </div>
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
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-line bg-white lg:block">
          <Sidebar onLogout={logout} />
        </aside>
        {mobileOpen && (
          <div className="fixed inset-0 z-50 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)}>
            <aside className="h-full w-72 bg-white" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-end p-2">
                <button onClick={() => setMobileOpen(false)} className="p-2" aria-label="close"><X className="h-5 w-5" /></button>
              </div>
              <Sidebar onNavigate={() => setMobileOpen(false)} onLogout={logout} />
            </aside>
          </div>
        )}
        <div className="lg:pl-64">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-white px-4 lg:hidden">
            <button onClick={() => setMobileOpen(true)} className="-ml-2 p-2" aria-label="menu"><Menu className="h-6 w-6" /></button>
            <span className="font-extrabold text-primary-dark">Admin</span>
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
