import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ReceiptText, Search } from 'lucide-react';
import { get, qs } from '../shared/api';
import type { AuditEntry, Order, OrderStatus, Paged, PersonRef, Role } from '../shared/types';
import { Card, Empty, ErrorState, Pager } from '../shared/ui';
import { StatusBadge } from '../shared/orderParts';
import { StaffOrderDetail } from '../shared/StaffOrderDetail';
import { OrdersListSkeleton, StaffOrderCard } from '../shared/staffParts';
import { dateTime, money, personName, prettyPhone } from '../shared/format';
import { AdminPage, TableWrap, useAdminEnv, useIsMobile } from './common';

type StaffRow = PersonRef & { id: number; role: Role };

export function useStaffList() {
  return useQuery({ queryKey: ['admin-staff'], queryFn: () => get<StaffRow[]>('/admin/staff'), staleTime: 60_000 });
}

const STATUSES: (OrderStatus | 'ACTIVE')[] = ['ACTIVE', 'NEW', 'ACCEPTED', 'PREPARING', 'READY', 'ON_THE_WAY', 'DELIVERED', 'PICKED_UP', 'CANCELLED'];

export function OrdersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const mobile = useIsMobile();
  const staff = useStaffList();
  const [f, setF] = useState({ status: '', deliveryType: '', sellerId: '', from: '', to: '', q: '' });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const h = setTimeout(() => {
      setF((x) => ({ ...x, q: search.trim() }));
      setPage(1);
    }, 350);
    return () => clearTimeout(h);
  }, [search]);
  const set = (k: keyof typeof f, v: string) => {
    setF((x) => ({ ...x, [k]: v }));
    setPage(1);
  };
  const q = useQuery({
    queryKey: ['admin-orders', f, page],
    queryFn: () => get<Paged<Order>>(`/admin/orders${qs({ ...f, page, limit: 30 })}`),
    refetchInterval: 20000,
  });

  return (
    <AdminPage title={t('admin.orders')} root>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 2xl:grid-cols-7">
          <div className="relative col-span-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input className="input h-10 pl-9 text-[14px]" placeholder={t('admin.searchOrders')} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input h-10 py-1 text-[14px]" value={f.status} onChange={(e) => set('status', e.target.value)}>
            <option value="">{t('admin.allStatuses')}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{t(`status.${s}`)}</option>
            ))}
          </select>
          <select className="input h-10 py-1 text-[14px]" value={f.deliveryType} onChange={(e) => set('deliveryType', e.target.value)}>
            <option value="">{t('admin.allTypes')}</option>
            <option value="DELIVERY">{t('orders.delivery')}</option>
            <option value="PICKUP">{t('orders.pickup')}</option>
          </select>
          <select className="input h-10 py-1 text-[14px]" value={f.sellerId} onChange={(e) => set('sellerId', e.target.value)}>
            <option value="">{t('admin.allSellers')}</option>
            {staff.data?.filter((s) => s.role === 'SELLER' || s.role === 'ADMIN').map((s) => (
              <option key={s.id} value={s.id}>{personName(s)}</option>
            ))}
          </select>
          <div className="col-span-2 flex items-center gap-1.5">
            <input type="date" className="input h-10 py-1 text-[13px]" value={f.from} onChange={(e) => set('from', e.target.value)} title={t('common.from')} />
            <input type="date" className="input h-10 py-1 text-[13px]" value={f.to} onChange={(e) => set('to', e.target.value)} title={t('common.to')} />
          </div>
        </div>

        {q.isLoading && <OrdersListSkeleton />}
        {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
        {q.data?.items.length === 0 && <Empty icon={ReceiptText} title={t('orders.empty')} />}
        {q.data && q.data.items.length > 0 &&
          (mobile ? (
            <div className="space-y-2.5">
              {q.data.items.map((o) => (
                <StaffOrderCard key={o.id} o={o} onClick={() => navigate(`/orders/${o.id}`)} />
              ))}
            </div>
          ) : (
            <TableWrap>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t('common.date')}</th>
                    <th>{t('admin.customer')}</th>
                    <th>{t('admin.type')}</th>
                    <th>{t('common.status')}</th>
                    <th>{t('admin.seller')}</th>
                    <th className="text-right">{t('common.total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.items.map((o) => (
                    <tr key={o.id} className="cursor-pointer" onClick={() => navigate(`/orders/${o.id}`)}>
                      <td className="font-extrabold">#{o.number}</td>
                      <td className="whitespace-nowrap text-muted">{dateTime(o.createdAt)}</td>
                      <td className="whitespace-nowrap">
                        <div className="font-semibold">{personName(o.customer)}</div>
                        <div className="text-[12px] text-muted">{prettyPhone(o.phone)}</div>
                      </td>
                      <td className="whitespace-nowrap">{o.deliveryType === 'DELIVERY' ? t('orders.delivery') : t('orders.pickup')}</td>
                      <td><StatusBadge status={o.status} /></td>
                      <td>{personName(o.seller) || '—'}</td>
                      <td className="whitespace-nowrap text-right font-bold">{money(o.finalTotal)}</td>
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

function HistoryBlock({ history }: { history: AuditEntry[] }) {
  const { t } = useTranslation();
  if (!history.length) return null;
  return (
    <Card className="p-4">
      <h3 className="mb-2 text-[15px] font-bold">{t('admin.audit')}</h3>
      <div className="space-y-1.5 text-[13px]">
        {history.map((h) => (
          <div key={h.id} className="flex justify-between gap-3">
            <span>
              <b>{h.action}</b> · {h.actorLabel}
            </span>
            <span className="shrink-0 text-muted">{dateTime(h.createdAt)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function OrderPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const env = useAdminEnv();
  return (
    <AdminPage title={t('admin.orderDetail')}>
      <div className="mx-auto max-w-3xl">
        <StaffOrderDetail
          orderId={Number(id)}
          role="ADMIN"
          meId={env.meId}
          isWeb={env.isWeb}
          fetchPath={`/admin/orders/${id}`}
          extra={(o) => <HistoryBlock history={o.history || []} />}
        />
      </div>
    </AdminPage>
  );
}
