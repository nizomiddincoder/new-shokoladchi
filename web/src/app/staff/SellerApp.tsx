import { useState } from 'react';
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BarChart3, ClipboardList, Inbox, Package, Plus } from 'lucide-react';
import { get } from '../../shared/api';
import type { Order } from '../../shared/types';
import { Button, Empty, ErrorState, Stat, Tabs } from '../../shared/ui';
import { StaffOrderDetail } from '../../shared/StaffOrderDetail';
import { ProductForm } from '../../shared/ProductForm';
import { ManageProductsList, OrdersListSkeleton, StaffOrderCard } from '../../shared/staffParts';
import { money } from '../../shared/format';
import { BottomNav, PageHeader, Screen, TopTitle } from '../layout';
import { useMe } from '../meContext';

type Tab = 'new' | 'mine' | 'history';

function SellerOrders() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('new');
  const q = useQuery({ queryKey: ['staff-orders', tab], queryFn: () => get<Order[]>(`/staff/orders?tab=${tab}`), refetchInterval: 15000 });
  const newCount = useQuery({ queryKey: ['staff-orders', 'new'], queryFn: () => get<Order[]>('/staff/orders?tab=new'), refetchInterval: 15000 });
  return (
    <Screen>
      <TopTitle title={t('nav.orders')} />
      <div className="space-y-3 px-4">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'new', label: `${t('staff.newOrders')}${newCount.data?.length ? ` (${newCount.data.length})` : ''}` },
            { value: 'mine', label: t('staff.myOrders') },
            { value: 'history', label: t('staff.history') },
          ]}
        />
        {q.isLoading && <OrdersListSkeleton />}
        {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
        {q.data?.length === 0 && <Empty icon={Inbox} title={t('staff.noOrders')} />}
        {q.data?.map((o) => (
          <StaffOrderCard key={o.id} o={o} onClick={() => navigate(`/staff/orders/${o.id}`)} />
        ))}
      </div>
    </Screen>
  );
}

export function StaffOrderPage({ base = '/staff/orders' }: { base?: string }) {
  void base;
  const { id } = useParams();
  const { t } = useTranslation();
  const me = useMe();
  return (
    <Screen withNav={false}>
      <PageHeader title={t('admin.orderDetail')} />
      <div className="px-4 pt-3">
        <StaffOrderDetail orderId={Number(id)} role={me.role!} meId={me.id} />
      </div>
    </Screen>
  );
}

export function SellerStats() {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['staff-stats'],
    queryFn: () => get<{ count: number; completed: number; cancelled: number; total: number }>('/staff/stats/today'),
    refetchInterval: 30000,
  });
  return (
    <Screen>
      <TopTitle title={t('staff.todayStats')} />
      <div className="grid grid-cols-2 gap-3 px-4">
        <Stat label={t('staff.ordersToday')} value={q.data?.count ?? '—'} />
        <Stat label={t('staff.sumToday')} value={q.data ? money(q.data.total) : '—'} />
        <Stat label={t('staff.completed')} value={q.data?.completed ?? '—'} />
        <Stat label={t('staff.cancelledCount')} value={q.data?.cancelled ?? '—'} tone="danger" />
      </div>
    </Screen>
  );
}

export function ProductsScreen({ title, onOpenPath }: { title?: string; onOpenPath: (id: number) => string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <Screen>
      <TopTitle
        title={title || t('nav.products')}
        right={
          <Button size="sm" icon={Plus} onClick={() => navigate('/products/new')}>
            {t('common.add')}
          </Button>
        }
      />
      <div className="px-4">
        <ManageProductsList onOpen={(p) => navigate(onOpenPath(p.id))} />
      </div>
    </Screen>
  );
}

export function ProductEditScreen() {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';
  return (
    <Screen withNav={false}>
      <PageHeader title={isNew ? t('pf.newTitle') : t('pf.editTitle')} />
      <div className="px-4 pt-3">
        <ProductForm productId={isNew ? undefined : Number(id)} onSaved={() => navigate(-1)} />
      </div>
    </Screen>
  );
}

export function SellerApp() {
  const { t } = useTranslation();
  return (
    <>
      <Routes>
        <Route path="/" element={<SellerOrders />} />
        <Route path="/staff/orders/:id" element={<StaffOrderPage />} />
        <Route path="/products" element={<ProductsScreen onOpenPath={(id) => `/products/${id}`} />} />
        <Route path="/products/new" element={<ProductEditScreen />} />
        <Route path="/products/:id" element={<ProductEditScreen />} />
        <Route path="/stats" element={<SellerStats />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Routes>
        {['/', '/products', '/stats'].map((p) => (
          <Route
            key={p}
            path={p}
            element={
              <BottomNav
                items={[
                  { to: '/', icon: ClipboardList, label: t('nav.orders'), end: true },
                  { to: '/products', icon: Package, label: t('nav.products') },
                  { to: '/stats', icon: BarChart3, label: t('nav.stats') },
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
