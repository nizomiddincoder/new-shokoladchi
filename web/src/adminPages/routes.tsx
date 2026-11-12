import { Navigate, Route, Routes } from 'react-router-dom';
import { BarChart3, Boxes, FileSpreadsheet, History, Image, LayoutDashboard, Megaphone, Package, ReceiptText, Settings, Tags, Users, UsersRound, type LucideIcon } from 'lucide-react';
import { DashboardPage } from './Dashboard';
import { OrderPage, OrdersPage } from './Orders';
import { CustomerPage, CustomersPage } from './Customers';
import { CategoriesPage, ProductEditPage, ProductsPage } from './Products';
import { WarehousePage } from './Warehouse';
import { StaffPage } from './Staff';
import { BannersPage, BroadcastPage } from './Marketing';
import { AuditPage, ExportPage, SettingsPage } from './System';

export const ADMIN_MENU: { to: string; icon: LucideIcon; key: string }[] = [
  { to: '/', icon: LayoutDashboard, key: 'admin.dashboard' },
  { to: '/orders', icon: ReceiptText, key: 'admin.orders' },
  { to: '/customers', icon: Users, key: 'admin.customers' },
  { to: '/products', icon: Package, key: 'admin.products' },
  { to: '/categories', icon: Tags, key: 'admin.categories' },
  { to: '/warehouse', icon: Boxes, key: 'admin.warehouse' },
  { to: '/staff', icon: UsersRound, key: 'admin.staff' },
  { to: '/broadcast', icon: Megaphone, key: 'admin.broadcast' },
  { to: '/banners', icon: Image, key: 'admin.banners' },
  { to: '/settings', icon: Settings, key: 'admin.settings' },
  { to: '/export', icon: FileSpreadsheet, key: 'admin.export' },
  { to: '/audit', icon: History, key: 'admin.audit' },
];

export { BarChart3 };

/** Web va mini app uchun umumiy admin marshrutlari */
export function AdminRoutes({ extra }: { extra?: React.ReactNode }) {
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/orders" element={<OrdersPage />} />
      <Route path="/orders/:id" element={<OrderPage />} />
      <Route path="/staff/orders/:id" element={<OrderPage />} />
      <Route path="/customers" element={<CustomersPage />} />
      <Route path="/customers/:id" element={<CustomerPage />} />
      <Route path="/products" element={<ProductsPage />} />
      <Route path="/products/new" element={<ProductEditPage />} />
      <Route path="/products/:id" element={<ProductEditPage />} />
      <Route path="/categories" element={<CategoriesPage />} />
      <Route path="/warehouse" element={<WarehousePage />} />
      <Route path="/warehouse/low" element={<WarehousePage />} />
      <Route path="/staff" element={<StaffPage />} />
      <Route path="/broadcast" element={<BroadcastPage />} />
      <Route path="/banners" element={<BannersPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/export" element={<ExportPage />} />
      <Route path="/audit" element={<AuditPage />} />
      {extra}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
