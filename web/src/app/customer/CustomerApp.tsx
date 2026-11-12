import { Navigate, Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { House, LayoutGrid, ReceiptText, ShoppingCart, UserRound } from 'lucide-react';
import { BottomNav } from '../layout';
import { useCart } from './hooks';
import { HomePage } from './HomePage';
import { CatalogPage, SearchPage } from './CatalogPage';
import { ProductPage } from './ProductPage';
import { CartPage } from './CartPage';
import { CheckoutPage } from './CheckoutPage';
import { OrderDetailPage, OrdersPage } from './OrdersPage';
import { FavoritesPage, ProfilePage } from './ProfilePage';

export function CustomerApp() {
  const { t } = useTranslation();
  const cart = useCart();
  return (
    <>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/catalog" element={<CatalogPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/product/:id" element={<ProductPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/orders/:id" element={<OrderDetailPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/favorites" element={<FavoritesPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
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
