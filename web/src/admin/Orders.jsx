import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { money, formatDateTime, gmapsUrl, ymapsUrl, formatPhone } from '../lib/format';
import { ORDER_STATUSES, STATUS_LABEL, DELIVERY_LABEL } from '../lib/status';
import { StatusBadge, Empty } from '../components/ui';

// Buyurtmalar ro'yxati: filtrlar + jadval
export default function Orders({ token }) {
  const [orders, setOrders] = useState(null);
  const [status, setStatus] = useState('');
  const [delivery, setDelivery] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const nav = useNavigate();

  useEffect(() => {
    const qs = new URLSearchParams();
    if (status) qs.set('status', status);
    if (delivery) qs.set('delivery', delivery);
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    api(`/api/admin/orders?${qs}`, { token }).then((d) => setOrders(d.orders)).catch(() => setOrders([]));
  }, [token, status, delivery, from, to]);

  return (
    <>
      <h1 className="h2 mb-4">Buyurtmalar</h1>

      {/* Filtrlar */}
      <div className="card card-pad mb-4" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="select" style={{ maxWidth: 180 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Barcha holatlar</option>
          {ORDER_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <select className="select" style={{ maxWidth: 180 }} value={delivery} onChange={(e) => setDelivery(e.target.value)}>
          <option value="">Barcha turlar</option>
          <option value="delivery">Yetkazib berish</option>
          <option value="pickup">Olib ketish</option>
        </select>
        <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ maxWidth: 160 }} />
        <span className="muted">—</span>
        <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ maxWidth: 160 }} />
      </div>

      {!orders ? <div className="skeleton" style={{ height: 200 }} /> : orders.length === 0 ? <Empty text="Buyurtma topilmadi" /> : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ID</th><th>Sana</th><th>Mijoz</th><th>Telefon</th>
                <th>Tur</th><th>Tovar</th><th className="right">Jami</th><th>Holat</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="clickable" onClick={() => nav(`/admin/orders/${o.id}`)}>
                  <td className="num">#{1000 + o.id}</td>
                  <td>{formatDateTime(o.created_at)}</td>
                  <td>{o.user_name}</td>
                  <td className="num">{formatPhone(o.user_phone || '')}</td>
                  <td>{DELIVERY_LABEL[o.delivery_type]}</td>
                  <td className="num">{o.items_count} ta</td>
                  <td className="right money" style={{ fontWeight: 600 }}>{money(o.total)}</td>
                  <td><StatusBadge status={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
