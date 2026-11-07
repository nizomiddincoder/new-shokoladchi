import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { money, formatDateTime, formatPhone } from '../lib/format';
import { Empty } from '../components/ui';

// Mijozlar ro'yxati (faqat ko'rish)
export default function Customers({ token }) {
  const [customers, setCustomers] = useState(null);

  useEffect(() => {
    api('/api/admin/customers', { token }).then((d) => setCustomers(d.customers)).catch(() => setCustomers([]));
  }, [token]);

  return (
    <>
      <h1 className="h2 mb-4">Mijozlar</h1>
      {!customers ? <div className="skeleton" style={{ height: 200 }} /> : customers.length === 0 ? <Empty /> : (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>Ism</th><th>Telefon</th><th className="right">Buyurtmalar</th><th className="right">Xaridlar</th><th>Ro'yxatdan o'tgan</th></tr></thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td className="num">{formatPhone(c.phone) || '—'}</td>
                  <td className="right num">{c.orders_count}</td>
                  <td className="right money">{money(c.spent)}</td>
                  <td className="muted">{formatDateTime(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
