import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { PersonalCheckoutState } from './PersonalPage';
import { useTranslation } from 'react-i18next';
import { House, LayoutGrid, ReceiptText, ShoppingCart, UserRound } from 'lucide-react';
import { BottomNav } from '../layout';
import { PageLoader } from '../../shared/ui';
import { useCart } from './hooks';
import { HomePage } from './HomePage';

/**
 * Bosh sahifa darhol yuklanadi, qolgan sahifalar alohida bo'laklarda (xarita, muharrir kabi
 * og'ir kutubxonalar birinchi ochilishni sekinlashtirmasin). Bosh sahifa chiqqandan keyin
 * ular fonda oldindan yuklab qo'yiladi — sahifalarga o'tish kechikmaydi.
 */
const loaders = {
  catalog: () => import('./CatalogPage'),
  product: () => import('./ProductPage'),
  cart: () => import('./CartPage'),
  checkout: () => import('./CheckoutPage'),
  personal: () => import('./PersonalPage'),
  orders: () => import('./OrdersPage'),
  profile: () => import('./ProfilePage'),
};
const CatalogPage = lazy(() => loaders.catalog().then((m) => ({ default: m.CatalogPage })));
const SearchPage = lazy(() => loaders.catalog().then((m) => ({ default: m.SearchPage })));
const ProductPage = lazy(() => loaders.product().then((m) => ({ default: m.ProductPage })));
const CartPage = lazy(() => loaders.cart().then((m) => ({ default: m.CartPage })));
const CheckoutPage = lazy(() => loaders.checkout().then((m) => ({ default: m.CheckoutPage })));
const PersonalPage = lazy(() => loaders.personal().then((m) => ({ default: m.PersonalPage })));
const OrdersPage = lazy(() => loaders.orders().then((m) => ({ default: m.OrdersPage })));
const OrderDetailPage = lazy(() => loaders.orders().then((m) => ({ default: m.OrderDetailPage })));
const ProfilePage = lazy(() => loaders.profile().then((m) => ({ default: m.ProfilePage })));
const FavoritesPage = lazy(() => loaders.profile().then((m) => ({ default: m.FavoritesPage })));

function usePrefetchPages() {
  useEffect(() => {
    const run = () => Object.values(loaders).forEach((l) => void l().catch(() => undefined));
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    const id = w.requestIdleCallback ? w.requestIdleCallback(run, { timeout: 4000 }) : window.setTimeout(run, 2500);
    return () => {
      if (!w.requestIdleCallback) clearTimeout(id);
    };
  }, []);
}

/** Dizayn tayyor bo'lmasa (masalan sahifa yangilansa) muharrirga qaytaradi */
function PersonalCheckoutRoute() {
  const location = useLocation();
  const state = location.state as PersonalCheckoutState | null;
  if (!state?.designUrl) return <Navigate to="/personal" replace />;
  return <CheckoutPage personal={state} />;
}

export function CustomerApp() {
  const { t } = useTranslation();
  const cart = useCart();
  usePrefetchPages();
  return (
    <>
      <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/catalog" element={<CatalogPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/product/:id" element={<ProductPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/personal" element={<PersonalPage />} />
        <Route path="/personal/checkout" element={<PersonalCheckoutRoute />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/orders/:id" element={<OrderDetailPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/favorites" element={<FavoritesPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
      <Routes>
        {['/', '/catalog', '/cart', '/orders', '/profile'].map((p) => (
          <Route
            key={p}
            path={p}
            element={
              <BottomNav
                items={[
                  { to: '/', icon: House, label: t('nav.home'), end: true },
                  { to: '/catalog', icon: LayoutGrid, label: t('nav.catalog') },
                  { to: '/cart', icon: ShoppingCart, label: t('nav.cart'), badge: cart.count },
                  { to: '/orders', icon: ReceiptText, label: t('nav.orders') },
                  { to: '/profile', icon: UserRound, label: t('nav.profile') },
                ]}
              />
            }
          />
        ))}
        <Route path="*" element={null} />
      </Routes>
    </>
  );
}
