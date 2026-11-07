import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { money, formatDateTime } from '../lib/format';
import { STATUS_LABEL } from '../lib/status';
import { StatusBadge, Empty } from '../components/ui';

// Buyurtmalar tarixi
export default function Orders({ token }) {
  const [orders, setOrders] = useState(null);
  const nav = useNavigate();

  useEffect(() => {
    api('/api/customer/orders', { token }).then((d) => setOrders(d.orders)).catch(() => setOrders([]));
  }, [token]);

  if (!orders) return <div className="page"><div className="skeleton" style={{ height: 200 }} /></div>;

  return (
    <div className="page" style={{ maxWidth: 520 }}>
      <h1 className="h1 mb-4">Buyurtmalarim</h1>
      {orders.length === 0 ? (
        <Empty text="Hali buyurtma yo'q" />
      ) : (
        <div className="stack">
          {orders.map((o) => (
            <div key={o.id} className="card card-pad clickable" style={{ cursor: 'pointer' }} onClick={() => nav(`/orders/${o.id}`)}>
              <div className="row-between">
                <div style={{ fontWeight: 700 }}>#{1000 + o.id}</div>
                <StatusBadge status={o.status} />
              </div>
              <div className="row-between" style={{ marginTop: 6 }}>
                <span className="small muted">{formatDateTime(o.created_at)} · {o.items_count} ta mahsulot</span>
                <span className="money" style={{ fontWeight: 700 }}>{money(o.total)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
