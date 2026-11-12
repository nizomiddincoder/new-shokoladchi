import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ban, CircleCheck, Search, Users } from 'lucide-react';
import { get, post, qs } from '../shared/api';
import type { Order, Paged } from '../shared/types';
import { Badge, Button, Card, ConfirmModal, Empty, ErrorState, PageLoader, Pager, Stat, useToast } from '../shared/ui';
import { OrderItemsList, StatusBadge } from '../shared/orderParts';
import { OrdersListSkeleton } from '../shared/staffParts';
import { dateTime, money, phoneHref, prettyPhone } from '../shared/format';
import { AdminPage, TableWrap, useIsMobile } from './common';

type CustomerRow = {
  id: number;
  firstName: string;
  lastName: string;
  phone: string | null;
  username: string | null;
  language: string;
  isBlocked: boolean;
  botBlocked: boolean;
  regStep: string;
  createdAt: string;
  ordersCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
};

export function CustomersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const mobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const h = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(h);
  }, [search]);
  const q = useQuery({
    queryKey: ['admin-customers', debounced, page],
    queryFn: () => get<Paged<CustomerRow>>(`/admin/customers${qs({ q: debounced, page, limit: 30 })}`),
  });
  const name = (c: CustomerRow) => `${c.firstName} ${c.lastName}`.trim() || '—';
  return (
    <AdminPage title={t('admin.customers')}>
      <div className="space-y-3">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input h-10 pl-9" placeholder={`${t('common.name')} / ${t('common.phone')}`} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {q.isLoading && <OrdersListSkeleton />}
        {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
        {q.data?.items.length === 0 && <Empty icon={Users} title={t('common.empty')} />}
        {q.data &&
          q.data.items.length > 0 &&
          (mobile ? (
            <div className="space-y-2">
              {q.data.items.map((c) => (
                <Card key={c.id} className="p-3.5" onClick={() => navigate(`/customers/${c.id}`)}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold">{name(c)}</div>
                      <div className="text-[13px] text-muted">{prettyPhone(c.phone)}</div>
                    </div>
                    {c.isBlocked && <Badge tone="danger">{t('common.blocked')}</Badge>}
                  </div>
                  <div className="mt-2 flex justify-between text-[13px]">
                    <span>{t('admin.ordersN')}: <b>{c.ordersCount}</b></span>
                    <span className="font-bold text-primary">{money(c.totalSpent)}</span>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <TableWrap>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>{t('common.name')}</th>
                    <th>{t('common.phone')}</th>
                    <th className="text-right">{t('admin.ordersN')}</th>
                    <th className="text-right">{t('admin.totalSpent')}</th>
                    <th>{t('admin.lastOrder')}</th>
                    <th>{t('admin.registeredAt')}</th>
                    <th>{t('common.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.items.map((c) => (
                    <tr key={c.id} className="cursor-pointer" onClick={() => navigate(`/customers/${c.id}`)}>
                      <td className="font-semibold">{name(c)}</td>
                      <td className="whitespace-nowrap">{prettyPhone(c.phone)}</td>
                      <td className="text-right">{c.ordersCount}</td>
                      <td className="whitespace-nowrap text-right font-bold">{money(c.totalSpent)}</td>
                      <td className="whitespace-nowrap text-muted">{dateTime(c.lastOrderAt) || '—'}</td>
                      <td className="whitespace-nowrap text-muted">{dateTime(c.createdAt)}</td>
                      <td>
                        {c.isBlocked ? <Badge tone="danger">{t('common.blocked')}</Badge> : c.regStep !== 'DONE' ? <Badge tone="muted">…</Badge> : <Badge tone="success">{t('common.active')}</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          ))}
        {q.data && <Pager page={page} pages={q.data.pages} onChange={setPage} />}
      </div>
    </AdminPage>
  );
}

type CustomerDetail = {
  user: { id: number; firstName: string; lastName: string; phone: string | null; username: string | null; isBlocked: boolean; createdAt: string; language: string };
  stats: { orders: number; completed: number; cancelled: number; totalSpent: number };
  orders: Order[];
};

export function CustomerPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ['admin-customer', id], queryFn: () => get<CustomerDetail>(`/admin/customers/${id}`) });
  if (q.isLoading) return <PageLoader />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const { user, stats, orders } = q.data;

  const toggleBlock = async () => {
    setBusy(true);
    try {
      await post(`/admin/users/${user.id}/block`, { blocked: !user.isBlocked });
      await qc.invalidateQueries({ queryKey: ['admin-customer', id] });
      await qc.invalidateQueries({ queryKey: ['admin-customers'] });
      toast.success(t('common.saved'));
      setConfirm(false);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminPage
      title={`${user.firstName} ${user.lastName}`.trim() || t('admin.customer')}
      actions={
        <Button size="sm" variant={user.isBlocked ? 'success' : 'danger'} icon={user.isBlocked ? CircleCheck : Ban} onClick={() => setConfirm(true)}>
          {user.isBlocked ? t('admin.unblock') : t('admin.block')}
        </Button>
      }
    >
      <div className="space-y-4">
        <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-[14px]">
          <a href={phoneHref(user.phone)} className="font-bold text-primary">{prettyPhone(user.phone)}</a>
          {user.username && <span className="text-muted">@{user.username}</span>}
          <span className="text-muted">{t('admin.registeredAt')}: {dateTime(user.createdAt)}</span>
          <span className="uppercase text-muted">{user.language}</span>
          {user.isBlocked && <Badge tone="danger">{t('common.blocked')}</Badge>}
        </Card>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label={t('admin.ordersN')} value={stats.orders} />
          <Stat label={t('staff.completed')} value={stats.completed} />
          <Stat label={t('staff.cancelledCount')} value={stats.cancelled} tone="danger" />
          <Stat label={t('admin.totalSpent')} value={money(stats.totalSpent)} />
        </div>
        <h3 className="text-[16px] font-bold">{t('admin.orderHistory')}</h3>
        {orders.length === 0 && <Empty icon={Users} title={t('orders.empty')} />}
        <div className="space-y-3">
          {orders.map((o) => (
            <Card key={o.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button className="text-[16px] font-extrabold text-primary hover:underline" onClick={() => navigate(`/orders/${o.id}`)}>
                  #{o.number}
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-muted">{dateTime(o.createdAt)}</span>
                  <StatusBadge status={o.status} />
                </div>
              </div>
              <OrderItemsList order={o} />
              <div className="mt-2 flex justify-between border-t border-line pt-2 text-[14px]">
                <span className="text-muted">{o.deliveryType === 'DELIVERY' ? t('orders.delivery') : t('orders.pickup')}</span>
                <span className="font-extrabold">{money(o.finalTotal)}</span>
              </div>
            </Card>
          ))}
        </div>
      </div>
      <ConfirmModal open={confirm} onClose={() => setConfirm(false)} onConfirm={toggleBlock} loading={busy} danger={!user.isBlocked} title={user.isBlocked ? t('admin.unblock') : t('admin.block')} />
    </AdminPage>
  );
}
