import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import { api } from '../lib/api';
import { initTelegram, tg } from '../lib/telegram';
import { IconHome, IconHeart, IconCart, IconReceipt, IconUser } from '../components/Icons';
import Home from './Home';
import Favorites from './Favorites';
import ProductPage from './ProductPage';
import CartPage from './CartPage';
import CheckoutPage from './CheckoutPage';
import Orders from './Orders';
import OrderDetail from './OrderDetail';
import Profile from './Profile';
import Onboarding from './Onboarding';

// --- Savatcha konteksti (localStorage'da saqlanadi)
const CartCtx = createContext(null);
export const useCart = () => useContext(CartCtx);

// --- Katalog konteksti (bir marta yuklanadi)
const CatalogCtx = createContext(null);
export const useCatalog = () => useContext(CatalogCtx);

// --- Sevimlilar (localStorage'dagi id'lar to'plami)
const FavCtx = createContext(null);
export const useFavorites = () => useContext(FavCtx);

function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cart') || '[]'); } catch { return []; }
  });
  useEffect(() => { localStorage.setItem('cart', JSON.stringify(items)); }, [items]);

  const value = useMemo(() => {
    const add = (product, qty = 1) => setItems((s) => {
      const i = s.findIndex((x) => x.product.id === product.id);
      if (i >= 0) {
        const next = [...s];
        next[i] = { ...next[i], qty: next[i].qty + qty };
        return next;
      }
      return [...s, { product, qty }];
    });
    const setQty = (productId, qty) => setItems((s) =>
      s.map((x) => (x.product.id === productId ? { ...x, qty } : x)).filter((x) => x.qty > 0)
    );
    const remove = (productId) => setItems((s) => s.filter((x) => x.product.id !== productId));
    const clear = () => setItems([]);
    const count = items.reduce((a, x) => a + x.qty, 0);
    const sum = items.reduce((a, x) => a + x.qty * x.product.price, 0);
    return { items, add, setQty, remove, clear, count, sum };
  }, [items]);

  return <CartCtx.Provider value={value}>{children}</CartCtx.Provider>;
}

function CatalogProvider({ children }) {
  const [catalog, setCatalog] = useState({ categories: [], products: [] });
  useEffect(() => {
    api('/api/customer/catalog').then(setCatalog).catch(() => {});
  }, []);
  return <CatalogCtx.Provider value={catalog}>{children}</CatalogCtx.Provider>;
}

function FavoritesProvider({ children }) {
  const [ids, setIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('favorites') || '[]')); } catch { return new Set(); }
  });
  useEffect(() => { localStorage.setItem('favorites', JSON.stringify([...ids])); }, [ids]);
  const toggle = (id) => setIds((s) => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  return <FavCtx.Provider value={{ ids, toggle }}>{children}</FavCtx.Provider>;
}

// --- Past navigatsiya: aktif element shokolad "pill" uslubida
function BottomNav() {
  const { count } = useCart();
  const tabs = [
    { to: '/', label: 'Bosh sahifa', Icon: IconHome },
    { to: '/favorites', label: 'Sevimlilar', Icon: IconHeart },
    { to: '/cart', label: 'Savat', Icon: IconCart, badge: count },
    { to: '/orders', label: 'Buyurtmalar', Icon: IconReceipt },
    { to: '/profile', label: 'Profil', Icon: IconUser },
  ];
  return (
    <nav className="bottom-nav">
      {tabs.map(({ to, label, Icon, badge }) => (
        <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
          <span style={{ position: 'relative' }}>
            <Icon size={21} />
            {badge ? <span className="tab-badge num">{badge}</span> : null}
          </span>
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

export default function CustomerApp() {
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState('');

  // Telegram temasi bo'yicha light/dark rejimni qo'llash
  useEffect(() => {
    const w = tg();
    const apply = () => {
      const dark = w ? w.colorScheme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    if (w && w.onEvent) w.onEvent('themeChanged', apply);
  }, []);

  // Kirish: initData orqali (faqsat token yo'q bo'lsa)
  useEffect(() => {
    if (!token) {
      const initData = tg()?.initData || '';
      api('/api/customer/auth', { method: 'POST', body: { initData } })
        .then((d) => {
          localStorage.setItem('token', d.token);
          setToken(d.token);
          setUser(d.user);
        })
        .catch((e) => setAuthError(e.message))
        .finally(() => setReady(true));
    } else {
      api('/api/customer/me', { token })
        .then((d) => setUser(d.user))
        .catch(() => { localStorage.removeItem('token'); setToken(null); })
        .finally(() => setReady(true));
    }
  }, [token]);

  if (!ready) return <div className="page"><div className="skeleton" style={{ height: 200 }} /></div>;

  // Telegram'dan tashqarida ochilgan (initData yo'q)
  if (!token) {
    return (
      <div className="page" style={{ paddingTop: 80 }}>
        <div className="card card-pad" style={{ textAlign: 'center' }}>
          <p>Ushbu ilova Telegram bot ichidan ochiladi.</p>
          <p className="muted small">{authError || 'Botga qaytib, «Buyurtma berish» tugmasini bosing.'}</p>
        </div>
      </div>
    );
  }

  // Ro'yxatdan o'tish: ism va telefon bo'lmasa onboarding ko'rsatiladi
  const needOnboarding = user && (!user.name || !user.phone);

  return (
    <CartProvider>
      <CatalogProvider>
        <FavoritesProvider>
          {needOnboarding ? (
            <Onboarding user={user} token={token} onDone={setUser} />
          ) : (
            <>
              <div className="customer-page">
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/favorites" element={<Favorites />} />
                  <Route path="/product/:id" element={<ProductPage />} />
                  <Route path="/cart" element={<CartPage />} />
                  <Route path="/checkout" element={<CheckoutPage token={token} />} />
                  <Route path="/orders" element={<Orders token={token} />} />
                  <Route path="/orders/:id" element={<OrderDetail token={token} />} />
                  <Route path="/profile" element={<Profile user={user} token={token} onSaved={setUser} />} />
                </Routes>
              </div>
              <BottomNav />
            </>
          )}
        </FavoritesProvider>
      </CatalogProvider>
    </CartProvider>
  );
}
