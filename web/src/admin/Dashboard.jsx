import React, { useEffect, useState } from 'react';
import { api, downloadCsv } from '../lib/api';
import { money } from '../lib/format';
import { Kpi, Empty } from '../components/ui';
import { IconDownload } from '../components/Icons';

const PERIODS = [
  { key: 'today', label: 'Bugun' },
  { key: 'week', label: 'Hafta' },
  { key: 'month', label: 'Oy' },
  { key: 'custom', label: 'Oraliq' },
];

// Bosh sahifa: davr bo'yicha KPI, top mahsulotlar, kategoriyalar, yetkazish nisbati
export default function Dashboard({ token }) {
  const [period, setPeriod] = useState('today');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [stats, setStats] = useState(null);

  const qs = period === 'custom' && from && to
    ? `period=custom&from=${from}&to=${to}`
    : `period=${period}`;

  useEffect(() => {
    setStats(null);
    if (period === 'custom' && (!from || !to)) return;
    api(`/api/admin/stats?${qs}`, { token }).then(setStats).catch(() => setStats(false));
  }, [token, period, from, to]); // eslint-disable-line

  if (stats === null) return <div className="skeleton" style={{ height: 240 }} />;
  if (stats === false) return <Empty text="Hisobotni yuklashda xatolik" />;

  const maxTop = Math.max(1, ...stats.top_products.map((p) => p.qty));
  const maxCat = Math.max(1, ...stats.category_revenue.map((c) => c.revenue));
  const pickup = stats.delivery_split.pickup || 0;
  const delivery = stats.delivery_split.delivery || 0;
  const splitTotal = Math.max(1, pickup + delivery);

  return (
    <>
      {/* Davr tanlash + eksport */}
      <div className="row-between mb-4" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {PERIODS.map((p) => (
            <button key={p.key} className={`chip${period === p.key ? ' active' : ''}`} onClick={() => setPeriod(p.key)}>
              {p.label}
            </button>
          ))}
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => downloadCsv(`/api/admin/export/orders.csv?${qs}`, token, 'buyurtmalar.csv')}>
          <IconDownload size={16} /> CSV yuklab olish
        </button>
      </div>

      {period === 'custom' && (
        <div className="row mb-4">
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ maxWidth: 180 }} />
          <span className="muted">—</span>
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ maxWidth: 180 }} />
        </div>
      )}

      {/* KPI kartochkalari */}
      <div className="kpi-grid mb-4">
        <Kpi label="Buyurtmalar" value={stats.orders_count} />
        <Kpi label="Umumiy tushum" value={money(stats.revenue)} />
        <Kpi label="O'rtacha chek" value={money(stats.avg_check)} />
        <Kpi label="Yangi mijozlar" value={stats.new_customers} />
      </div>

      <div className="grid2" style={{ alignItems: 'start' }}>
        {/* Top 10 mahsulot */}
        <div className="card card-pad">
          <div className="h2 mb-2">Eng ko'p sotilgan (top 10)</div>
          {stats.top_products.length === 0 ? <Empty /> : stats.top_products.map((p) => (
            <div key={p.name} className="bar-row">
              <div className="row-between">
                <span>{p.name}</span>
                <span className="num muted">{p.qty} dona</span>
              </div>
              <div className="bar-track"><div className="bar-fill" style={{ width: `${(p.qty / maxTop) * 100}%` }} /></div>
            </div>
          ))}
        </div>

        <div className="stack">
          {/* Kategoriyalar bo'yicha tushum */}
          <div className="card card-pad">
            <div className="h2 mb-2">Kategoriyalar bo'yicha tushum</div>
            {stats.category_revenue.length === 0 ? <Empty /> : stats.category_revenue.map((c) => (
              <div key={c.name} className="bar-row">
                <div className="row-between">
                  <span>{c.name}</span>
                  <span className="num muted">{money(c.revenue)}</span>
                </div>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${(c.revenue / maxCat) * 100}%` }} /></div>
              </div>
            ))}
          </div>

          {/* Olib ketish / yetkazib berish nisbati */}
          <div className="card card-pad">
            <div className="h2 mb-2">Olib ketish / Yetkazib berish</div>
            <div style={{ display: 'flex', height: 12, borderRadius: 999, overflow: 'hidden', background: 'var(--color-primary-100)' }}>
              <div style={{ width: `${(pickup / splitTotal) * 100}%`, background: 'var(--color-primary-600)' }} />
              <div style={{ width: `${(delivery / splitTotal) * 100}%`, background: 'var(--color-primary-400)' }} />
            </div>
            <div className="row-between" style={{ marginTop: 10 }}>
              <span className="small"><span style={{ color: 'var(--color-primary-600)' }}>●</span> Olib ketish — <b className="num">{pickup}</b></span>
              <span className="small"><span style={{ color: 'var(--color-primary-400)' }}>●</span> Yetkazib berish — <b className="num">{delivery}</b></span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
