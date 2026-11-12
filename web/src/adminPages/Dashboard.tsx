import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Ban, Banknote, ReceiptText, ShoppingBag, UserPlus } from 'lucide-react';
import { get, qs } from '../shared/api';
import { ErrorState, PageLoader, Stat } from '../shared/ui';
import { money, qty } from '../shared/format';
import { AdminPage, RangePicker, TableWrap, type RangeValue } from './common';

type Dash = {
  revenue: number;
  orders: number;
  completed: number;
  avgCheck: number;
  cancelled: number;
  cancelledPercent: number;
  newCustomers: number;
  daily: { date: string; orders: number; revenue: number }[];
  hours: { hour: number; orders: number }[];
  topProducts: { productId: number; name: string; unit: string; qty: number; revenue: number }[];
  sellers: { id: number; name: string; accepted: number; completed: number; revenue: number; avgAcceptMin: number | null }[];
};

const TOOLTIP_STYLE = { background: 'rgb(var(--c-card))', border: '1px solid rgb(var(--c-line))', borderRadius: 12, color: 'rgb(var(--c-ink))' };

const compact = (n: number) => (n >= 1_000_000 ? `${Math.round(n / 100_000) / 10}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

export function DashboardPage() {
  const { t } = useTranslation();
  const [range, setRange] = useState<RangeValue>({ preset: '7d', from: '', to: '' });
  const q = useQuery({
    queryKey: ['dashboard', range],
    queryFn: () => get<Dash>(`/admin/dashboard${qs({ preset: range.preset, from: range.from, to: range.to })}`),
    refetchInterval: 60000,
  });
  const d = q.data;
  return (
    <AdminPage title={t('admin.dashboard')} root>
      <div className="space-y-4">
        <RangePicker value={range} onChange={setRange} />
        {q.isLoading && <PageLoader />}
        {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
        {d && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Stat icon={Banknote} label={t('admin.revenue')} value={money(d.revenue)} />
              <Stat icon={ReceiptText} label={t('admin.ordersCount')} value={d.orders} />
              <Stat icon={ShoppingBag} label={t('admin.avgCheck')} value={money(d.avgCheck)} />
              <Stat icon={Ban} label={t('admin.cancelledPct')} value={`${d.cancelledPercent}%`} tone={d.cancelledPercent > 15 ? 'danger' : undefined} />
              <Stat icon={UserPlus} label={t('admin.newCustomers')} value={d.newCustomers} />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="card p-4">
                <h3 className="mb-3 text-[15px] font-bold">{t('admin.dailySales')}</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={d.daily} margin={{ left: -10, right: 8, top: 8 }}>
                      <CartesianGrid stroke="rgb(var(--c-line))" strokeDasharray="3 3" />
                      <XAxis dataKey="date" tickFormatter={(v: string) => v.slice(5)} fontSize={11} stroke="rgb(var(--c-muted))" />
                      <YAxis tickFormatter={compact} fontSize={11} stroke="rgb(var(--c-muted))" />
                      <Tooltip formatter={(v: number) => money(v)} labelStyle={{ fontWeight: 700 }} contentStyle={TOOLTIP_STYLE} />
                      <Line type="monotone" dataKey="revenue" stroke="rgb(var(--c-primary))" strokeWidth={2.5} dot={{ r: 2.5 }} name={t('admin.revenue')} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="card p-4">
                <h3 className="mb-3 text-[15px] font-bold">{t('admin.byHours')}</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={d.hours} margin={{ left: -20, right: 8, top: 8 }}>
                      <CartesianGrid stroke="rgb(var(--c-line))" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="hour" fontSize={11} stroke="rgb(var(--c-muted))" />
                      <YAxis allowDecimals={false} fontSize={11} stroke="rgb(var(--c-muted))" />
                      <Tooltip labelFormatter={(h) => `${String(h).padStart(2, '0')}:00`} contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgb(var(--c-primary-soft))' }} />
                      <Bar dataKey="orders" fill="rgb(var(--c-primary-light))" radius={[6, 6, 0, 0]} name={t('admin.ordersCount')} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-[15px] font-bold">{t('admin.topProducts')}</h3>
              <TableWrap>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{t('nav.products')}</th>
                      <th className="text-right">{t('common.count')}</th>
                      <th className="text-right">{t('common.sum')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.topProducts.length === 0 && (
                      <tr>
                        <td colSpan={4} className="text-center text-muted">{t('common.empty')}</td>
                      </tr>
                    )}
                    {d.topProducts.map((p, i) => (
                      <tr key={`${p.productId ?? 'x'}-${p.name}`}>
                        <td className="font-bold text-muted">{i + 1}</td>
                        <td className="font-semibold">{p.name}</td>
                        <td className="text-right">{qty(p.qty)}</td>
                        <td className="text-right font-bold">{money(p.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </div>

            <div>
              <div>
                <h3 className="mb-2 text-[15px] font-bold">{t('admin.sellersRating')}</h3>
                <TableWrap>
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>{t('admin.seller')}</th>
                        <th className="text-right">{t('admin.accepted')}</th>
                        <th className="text-right">{t('admin.avgAccept')}</th>
                        <th className="text-right">{t('common.sum')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.sellers.map((s) => (
                        <tr key={s.id}>
                          <td className="font-semibold">{s.name}</td>
                          <td className="text-right">{s.accepted}</td>
                          <td className="text-right">{s.avgAcceptMin != null ? `${s.avgAcceptMin} ${t('common.min')}` : '—'}</td>
                          <td className="text-right font-bold">{money(s.revenue)}</td>
                        </tr>
                      ))}
                      {d.sellers.length === 0 && (
                        <tr>
                          <td colSpan={4} className="text-center text-muted">{t('common.empty')}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </TableWrap>
              </div>
            </div>
          </>
        )}
      </div>
    </AdminPage>
  );
}
