import React, { useEffect, useState } from 'react';
import { Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Logo, IconChart, IconReceipt, IconBox, IconTag, IconStore, IconUser, IconHome, IconSettings } from '../components/Icons';
import Login from './Login';
import Dashboard from './Dashboard';
import Orders from './Orders';
import OrderDetail from './OrderDetail';
import Products from './Products';
import Categories from './Categories';
import Branches from './Branches';
import Customers from './Customers';
import Warehouse from './Warehouse';

// Yon panel: aktif element past-navigatsiyadagi "pill" uslubida
function Sidebar() {
  const items = [
    { to: '/admin', label: 'Hisobotlar', Icon: IconChart, end: true },
    { to: '/admin/orders', label: 'Buyurtmalar', Icon: IconReceipt },
    { to: '/admin/products', label: 'Mahsulotlar', Icon: IconBox },
    { to: '/admin/categories', label: 'Kategoriyalar', Icon: IconTag },
    { to: '/admin/branches', label: 'Filiallar', Icon: IconStore },
    { to: '/admin/customers', label: 'Mijozlar', Icon: IconUser },
    { to: '/admin/warehouse', label: 'Ombor', Icon: IconHome },
  ];
  return (
    <aside className="sidebar">
      <div className="brand"><Logo size={26} /> Shokoladchi Admin</div>
      {items.map(({ to, label, Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>
          <Icon size={19} /> {label}
        </NavLink>
      ))}
    </aside>
  );
}

export default function AdminApp() {
  const [token, setToken] = useState(() => localStorage.getItem('admin_token'));
  const nav = useNavigate();

  // Tungi rejimni tizim sozlamasidan olish
  useEffect(() => {
    document.documentElement.dataset.theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }, []);

  const logout = () => {
    localStorage.removeItem('admin_token');
    setToken(null);
    nav('/admin');
  };

  if (!token) return <Login onLogin={setToken} />;

  return (
    <>
      <Sidebar />
      <main className="admin-main">
        <div className="row-between mb-4">
          <span className="muted small">Boshqaruv paneli</span>
          <button className="btn btn-ghost btn-sm" onClick={logout}>
            <IconSettings size={16} /> Chiqish
          </button>
        </div>
        <Routes>
          <Route path="/" element={<Dashboard token={token} />} />
          <Route path="/orders" element={<Orders token={token} />} />
          <Route path="/orders/:id" element={<OrderDetail token={token} />} />
          <Route path="/products" element={<Products token={token} />} />
          <Route path="/categories" element={<Categories token={token} />} />
          <Route path="/branches" element={<Branches token={token} />} />
          <Route path="/customers" element={<Customers token={token} />} />
          <Route path="/warehouse" element={<Warehouse token={token} />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </main>
    </>
  );
}
