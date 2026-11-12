import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Bike, History, Inbox, PackageOpen } from 'lucide-react';
import { get } from '../../shared/api';
import type { Order } from '../../shared/types';
import { Empty, ErrorState, Stat } from '../../shared/ui';
import { StaffOrderDetail } from '../../shared/StaffOrderDetail';
import { OrdersListSkeleton, StaffOrderCard } from '../../shared/staffParts';
import { money } from '../../shared/format';
import { BottomNav, PageHeader, Screen, TopTitle } from '../layout';
import { useMe } from '../meContext';

type Tab = 'active' | 'available' | 'done';

function CourierList({ tab }: { tab: Tab }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['courier-orders', tab], queryFn: () => get<Order[]>(`/staff/courier/orders?tab=${tab}`), refetchInterval: 15000 });
  const stats = useQuery({
    queryKey: ['staff-stats', 'courier'],
    queryFn: () => get<{ delivered: number; active: number; total: number }>('/staff/stats/today'),
    refetchInterval: 30000,
  });
  const title = tab === 'active' ? t('nav.active') : tab === 'available' ? t('nav.available') : t('nav.history');
  return (
    <Screen>
      <TopTitle title={title} />
      <div className="space-y-3 px-4">
        {tab === 'active' && (
          <div className="grid grid-cols-3 gap-2">
            <Stat label={t('staff.deliveredToday')} value={stats.data?.delivered ?? '—'} />
            <Stat label={t('staff.activeDeliveries')} value={stats.data?.active ?? '—'} />
            <Stat label={t('staff.sumToday')} value={stats.data ? money(stats.data.total) : '—'} />
          </div>
        )}
        {q.isLoading && <OrdersListSkeleton />}
        {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
        {q.data?.length === 0 && <Empty icon={Inbox} title={t('staff.noOrders')} />}
        {q.data?.map((o) => (
          <StaffOrderCard key={o.id} o={o} onClick={() => navigate(`/courier/orders/${o.id}`)} />
        ))}
      </div>
    </Screen>
  );
}

function CourierOrderPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const me = useMe();
  return (
    <Screen withNav={false}>
      <PageHeader title={t('admin.orderDetail')} />
      <div className="px-4 pt-3">
        <StaffOrderDetail orderId={Number(id)} role="COURIER" meId={me.id} />
      </div>
    </Screen>
  );
}

export function CourierApp() {
  const { t } = useTranslation();
  return (
    <>
      <Routes>
        <Route path="/" element={<CourierList tab="active" />} />
        <Route path="/available" element={<CourierList tab="available" />} />
        <Route path="/history" element={<CourierList tab="done" />} />
        <Route path="/courier/orders/:id" element={<CourierOrderPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Routes>
        {['/', '/available', '/history'].map((p) => (
          <Route
            key={p}
            path={p}
            element={
              <BottomNav
                items={[
                  { to: '/', icon: Bike, label: t('nav.active'), end: true },
                  { to: '/available', icon: PackageOpen, label: t('nav.available') },
                  { to: '/history', icon: History, label: t('nav.history') },
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
