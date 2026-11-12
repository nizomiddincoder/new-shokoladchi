import { Route, Routes, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Grid2x2, Languages, LayoutDashboard, Package, ReceiptText } from 'lucide-react';
import { AdminCtx, AdminPage } from '../../adminPages/common';
import { ADMIN_MENU, AdminRoutes } from '../../adminPages/routes';
import { Card, Segmented } from '../../shared/ui';
import { setLanguage } from '../../shared/i18n';
import { ThemeSwitchCard } from '../../shared/ThemeSwitch';
import { patch } from '../../shared/api';
import { BottomNav } from '../layout';
import { useMe } from '../meContext';

function MenuPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const changeLang = (l: 'uz' | 'ru') => {
    setLanguage(l);
    void patch('/shop/me', { language: l }).catch(() => undefined);
  };
  return (
    <AdminPage title={t('nav.menu')} root>
      <div className="grid grid-cols-3 gap-2.5">
        {ADMIN_MENU.map((m) => (
          <Card key={m.to} className="flex flex-col items-center gap-2 px-2 py-4 text-center" onClick={() => navigate(m.to)}>
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-soft">
              <m.icon className="h-5 w-5 text-primary" />
            </span>
            <span className="text-[12px] font-semibold leading-tight">{t(m.key)}</span>
          </Card>
        ))}
      </div>
      <Card className="mt-4 p-4">
        <div className="mb-2 flex items-center gap-2 text-[14px] font-bold">
          <Languages className="h-4 w-4 text-primary" /> {t('common.language')}
        </div>
        <Segmented
          value={i18n.language === 'ru' ? 'ru' : 'uz'}
          onChange={changeLang}
          items={[
            { value: 'uz', label: "O'zbekcha" },
            { value: 'ru', label: 'Русский' },
          ]}
        />
      </Card>
      <div className="mt-3">
        <ThemeSwitchCard />
      </div>
    </AdminPage>
  );
}

export function AdminMiniApp() {
  const { t } = useTranslation();
  const me = useMe();
  return (
    <AdminCtx.Provider value={{ isWeb: false, meId: me.id }}>
      <AdminRoutes extra={<Route path="/menu" element={<MenuPage />} />} />
      <Routes>
        {['/', '/orders', '/products', '/menu'].map((p) => (
          <Route
            key={p}
            path={p}
            element={
              <BottomNav
                items={[
                  { to: '/', icon: LayoutDashboard, label: t('nav.dashboard'), end: true },
                  { to: '/orders', icon: ReceiptText, label: t('nav.orders') },
                  { to: '/products', icon: Package, label: t('nav.products') },
                  { to: '/menu', icon: Grid2x2, label: t('nav.menu') },
                ]}
              />
            }
          />
        ))}
        <Route path="*" element={null} />
      </Routes>
    </AdminCtx.Provider>
  );
}
