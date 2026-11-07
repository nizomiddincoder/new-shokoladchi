import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { money, formatDateTime, gmapsUrl, ymapsUrl, formatPhone } from '../lib/format';
import { ORDER_STATUSES, STATUS_LABEL, DELIVERY_LABEL } from '../lib/status';
import { StatusBadge } from '../components/ui';

// Buyurtma tafsilotlari: mijoz, lokatsiya, tarkib, holatni o'zgartirish
export default function OrderDetail({ token }) {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('');
  const [deliveryPrice, setDeliveryPrice] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/api/admin/orders/${id}`, { token }).then((d) => {
      setData(d);
      setStatus(d.order.status);
      setDeliveryPrice(d.order.delivery_price || 0);
    }).catch(() => setData(false));
  }, [id, token]);

  if (data === null) return <div className="skeleton" style={{ height: 240 }} />;
  if (data === false) return <p className="muted">Buyurtma topilmadi</p>;

  const { order, items } = data;

  async function save() {
    setSaved(false); setError('');
    try {
      await api(`/api/admin/orders/${id}`, {
        method: 'PATCH', token,
        body: { status, delivery_price: deliveryPrice },
      });
      const d = await api(`/api/admin/orders/${id}`, { token });
      setData(d);
      setSaved(true);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <>
      <div className="row-between mb-4">
        <div className="row">
          <Link to="/admin/orders" className="muted small">Buyurtmalar</Link>
          <span className="muted">/</span>
          <h1 className="h2">#{1000 + order.id}</h1>
          <StatusBadge status={order.status} />
        </div>
        <span className="muted small">{formatDateTime(order.created_at)}</span>
      </div>

      <div className="grid2" style={{ alignItems: 'start', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        {/* Mijoz va yetkazish */}
        <div className="stack">
          <div className="card card-pad">
            <div className="h2 mb-2">Mijoz</div>
            <div><b>{order.user_name}</b></div>
            {order.user_phone && (
              <div className="row mb-2" style={{ marginTop: 4 }}>
                <a className="money" href={`tel:${order.user_phone}`} style={{ color: 'var(--color-primary-600)' }}>
                  {formatPhone(order.user_phone)}
                </a>
              </div>
            )}
            <div className="small muted">{DELIVERY_LABEL[order.delivery_type]}</div>
          </div>

          <div className="card card-pad">
            <div className="h2 mb-2">Manzil</div>
            {order.delivery_type === 'pickup' ? (
              <>
                <div><b>{order.branch_name}</b></div>
                <div className="small muted">{order.branch_address}</div>
              </>
            ) : order.lat && order.lng ? (
              <>
                {order.address_note && <div className="mb-2">{order.address_note}</div>}
                <div className="small muted num mb-2">{order.lat.toFixed(5)}, {order.lng.toFixed(5)}</div>
                <div className="row">
                  <a className="btn btn-secondary btn-sm" href={gmapsUrl(order.lat, order.lng)} target="_blank" rel="noreferrer">Google Maps</a>
                  <a className="btn btn-secondary btn-sm" href={ymapsUrl(order.lat, order.lng)} target="_blank" rel="noreferrer">Yandex</a>
                </div>
              </>
            ) : (
              <div className="small muted">{order.address_note || 'Manzil ko‘rsatilmagan'}</div>
            )}
          </div>
        </div>

        {/* Tarkib va holat */}
        <div className="stack">
          <div className="card table-wrap">
            <table className="table">
              <thead><tr><th>Mahsulot</th><th className="right">Miqdor</th><th className="right">Narx</th><th className="right">Summa</th></tr></thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td>{it.name_snapshot}</td>
                    <td className="right num">{it.qty}</td>
                    <td className="right money">{money(it.price_snapshot)}</td>
                    <td className="right money" style={{ fontWeight: 600 }}>{money(it.price_snapshot * it.qty)}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={3} className="right muted">Yetkazib berish</td>
                  <td className="right money">{money(order.delivery_price)}</td>
                </tr>
                <tr>
                  <td colSpan={3} className="right" style={{ fontWeight: 700 }}>Jami</td>
                  <td className="right money" style={{ fontWeight: 700, color: 'var(--color-primary-600)' }}>{money(order.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="card card-pad">
            <div className="h2 mb-2">Holat va yetkazish narxi</div>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <select className="select" style={{ maxWidth: 220 }} value={status} onChange={(e) => setStatus(e.target.value)}>
                {ORDER_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
              <input
                className="input num" type="number" min="0" step="1000"
                style={{ maxWidth: 180 }}
                value={deliveryPrice}
                onChange={(e) => setDeliveryPrice(e.target.value)}
                placeholder="Yetkazish narxi, so'm"
              />
              <button className="btn btn-primary" onClick={save}>Saqlash</button>
            </div>
            <p className="small muted" style={{ margin: '8px 0 0' }}>
              Holat o'zgarganda mijozga Telegram orqali xabar yuboriladi.
              Yetkazish narxi kiritilsa jami summa avtomatik yangilanadi.
            </p>
            {saved && <p className="small" style={{ color: 'var(--color-success)' }}>Saqlandi ✅</p>}
            {error && <p className="small" style={{ color: 'var(--color-danger)' }}>{error}</p>}
          </div>
        </div>
      </div>
    </>
  );
}
