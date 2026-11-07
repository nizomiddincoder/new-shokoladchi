import React, { useEffect, useState } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { money, formatDateTime, gmapsUrl, ymapsUrl } from '../lib/format';
import { ORDER_STATUSES, STATUS_LABEL, DELIVERY_LABEL } from '../lib/status';
import { IconPin, IconStore, IconCheck } from '../components/Icons';

// Buyurtma holati va tafsilotlari
export default function OrderDetail({ token }) {
  const { id } = useParams();
  const { state } = useLocation();
  const [data, setData] = useState(null);

  useEffect(() => {
    api(`/api/customer/orders/${id}`, { token }).then(setData).catch(() => setData(false));
  }, [id, token]);

  // Yangi buyurtma yaratilganda holatni 10 sekund davomida yangilab turamiz
  useEffect(() => {
    if (!state?.justCreated) return;
    const iv = setInterval(() => {
      api(`/api/customer/orders/${id}`, { token }).then(setData).catch(() => {});
    }, 10000);
    return () => clearInterval(iv);
  }, [id, token, state]);

  if (data === null) return <div className="page"><div className="skeleton" style={{ height: 200 }} /></div>;
  if (data === false) return <div className="page"><p className="muted">Buyurtma topilmadi</p></div>;

  const { order, items } = data;
  const failed = order.status === 'cancelled';
  const doneIdx = ORDER_STATUSES.indexOf(order.status);

  return (
    <div className="page" style={{ maxWidth: 520 }}>
      <div style={{ textAlign: 'center', margin: '16px 0 20px' }}>
        {failed ? (
          <div className="badge badge-danger" style={{ fontSize: 14, padding: '8px 16px' }}>Bekor qilingan</div>
        ) : (
          <div className="badge badge-success" style={{ fontSize: 14, padding: '8px 16px' }}>
            <IconCheck size={16} style={{ marginRight: 6 }} /> {STATUS_LABEL[order.status]}
          </div>
        )}
        <h1 className="h1" style={{ marginTop: 12 }}>Buyurtma #{1000 + order.id}</h1>
        <p className="muted small">{formatDateTime(order.created_at)}</p>
      </div>

      {/* Holat bosqichlari */}
      {!failed && (
        <div className="card card-pad mb-4">
          {ORDER_STATUSES.slice(0, 4).map((s, i) => (
            <div key={s} className="row" style={{ gap: 12, opacity: i <= doneIdx ? 1 : 0.45 }}>
              <span
                style={{
                  width: 22, height: 22, borderRadius: 999, flexShrink: 0,
                  background: i <= doneIdx ? 'var(--color-primary-600)' : 'var(--color-border)',
                  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700,
                }}
              >
                {i + 1}
              </span>
              <div style={{ padding: '8px 0', fontWeight: i === doneIdx ? 700 : 500 }}>{STATUS_LABEL[s]}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tarkib */}
      <div className="card card-pad mb-4">
        {items.map((it) => (
          <div key={it.id} className="row-between" style={{ padding: '6px 0' }}>
            <span>{it.name_snapshot} <span className="muted">×{it.qty}</span></span>
            <span className="money">{money(it.price_snapshot * it.qty)}</span>
          </div>
        ))}
        <div className="row-between" style={{ borderTop: '1px solid var(--color-border)', marginTop: 8, paddingTop: 8 }}>
          <span className="muted">Yetkazib berish</span>
          <span className="money">{order.delivery_price ? money(order.delivery_price) : '—'}</span>
        </div>
        <div className="row-between" style={{ fontWeight: 700, fontSize: 16, marginTop: 4 }}>
          <span>Jami</span>
          <span className="money" style={{ color: 'var(--color-primary-600)' }}>{money(order.total)}</span>
        </div>
      </div>

      {/* Yetkazish ma'lumotlari */}
      <div className="card card-pad">
        <div className="row mb-2" style={{ gap: 8 }}>
          {order.delivery_type === 'pickup' ? <IconStore size={18} /> : <IconPin size={18} />}
          <b>{DELIVERY_LABEL[order.delivery_type]}</b>
        </div>
        {order.delivery_type === 'pickup' ? (
          <>
            <div className="mb-2">{order.branch_name}</div>
            <div className="small muted mb-2">{order.branch_address}</div>
            {order.branch_lat && order.branch_lng && (
              <a className="btn btn-secondary btn-sm" href={gmapsUrl(order.branch_lat, order.branch_lng)} target="_blank" rel="noreferrer">
                Xaritada ochish
              </a>
            )}
          </>
        ) : (
          <>
            {order.address_note && <div className="mb-2">{order.address_note}</div>}
            {order.lat && order.lng ? (
              <div className="row">
                <a className="btn btn-secondary btn-sm" href={gmapsUrl(order.lat, order.lng)} target="_blank" rel="noreferrer">Google Maps</a>
                <a className="btn btn-secondary btn-sm" href={ymapsUrl(order.lat, order.lng)} target="_blank" rel="noreferrer">Yandex</a>
              </div>
            ) : null}
          </>
        )}
      </div>

      <Link className="btn btn-ghost btn-block" style={{ marginTop: 12 }} to="/orders">Buyurtmalar ro'yxati</Link>
    </div>
  );
}
