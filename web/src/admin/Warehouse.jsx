import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { money, formatDateTime } from '../lib/format';
import { stockBadge } from '../lib/status';
import { Modal, Kpi, Empty } from '../components/ui';

// Ombor: qoldiq jadvali, kirim/chiqim harakatlari
export default function Warehouse({ token }) {
  const [products, setProducts] = useState(null);
  const [movements, setMovements] = useState([]);
  const [editing, setEditing] = useState(null); // { product, sign }
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  function reload() {
    api('/api/admin/stock', { token }).then((d) => setProducts(d.products)).catch(() => setProducts([]));
    api('/api/admin/stock/movements', { token }).then((d) => setMovements(d.movements)).catch(() => {});
  }
  useEffect(reload, [token]);

  async function saveMovement() {
    setError('');
    try {
      const delta = editing.sign * (parseInt(qty, 10) || 0);
      await api(`/api/admin/stock/${editing.product.id}/movement`, {
        method: 'POST', token, body: { delta, reason },
      });
      setEditing(null); setQty(''); setReason('');
      reload();
    } catch (e) { setError(e.message); }
  }

  if (!products) return <div className="skeleton" style={{ height: 240 }} />;

  const tracked = products.filter((p) => p.stock !== null);
  const low = tracked.filter((p) => p.stock > 0 && p.stock <= p.min_level).length;
  const out = tracked.filter((p) => p.stock === 0).length;

  return (
    <>
      <h1 className="h2 mb-4">Ombor</h1>

      <div className="kpi-grid mb-4">
        <Kpi label="Jami mahsulot" value={products.length} />
        <Kpi label="Kam qoldiq" value={low} />
        <Kpi label="Tugagan" value={out} />
        <Kpi label="So'nggi harakatlar" value={movements.length} />
      </div>

      <div className="card table-wrap mb-4">
        <table className="table">
          <thead>
            <tr><th>Nomi</th><th>Kategoriya</th><th className="right">Qoldiq</th><th className="right">Min.</th><th>Holat</th><th className="right">Harakat</th></tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const b = stockBadge(p.stock, p.min_level);
              return (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600 }}>{p.name}</td>
                  <td className="muted">{p.category_name || '—'}</td>
                  <td className="right num" style={{ fontWeight: 700 }}>{p.stock === null ? '—' : p.stock}</td>
                  <td className="right num muted">{p.stock === null ? '—' : p.min_level}</td>
                  <td><span className={b.cls}>{b.label}</span></td>
                  <td className="right" style={{ whiteSpace: 'nowrap' }}>
                    {p.stock !== null && (
                      <>
                        <button className="btn btn-secondary btn-sm" onClick={() => setEditing({ product: p, sign: 1 })}>+ Kirim</button>{' '}
                        <button className="btn btn-danger btn-sm" onClick={() => setEditing({ product: p, sign: -1 })}>− Chiqim</button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 className="h2 mb-2">So'nggi harakatlar</h2>
      {movements.length === 0 ? <Empty text="Harakat yo'q" /> : (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>Sana</th><th>Mahsulot</th><th className="right">Miqdor</th><th>Sabab</th></tr></thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id}>
                  <td>{formatDateTime(m.created_at)}</td>
                  <td>{m.product_name}</td>
                  <td className="right num" style={{ fontWeight: 700, color: m.delta > 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                    {m.delta > 0 ? `+${m.delta}` : m.delta}
                  </td>
                  <td className="muted">{m.reason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal
          title={editing.sign > 0 ? `Kirim: ${editing.product.name}` : `Chiqim: ${editing.product.name}`}
          onClose={() => setEditing(null)}
        >
          <div className="field">
            <label>Miqdor</label>
            <input className="input num" type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
          </div>
          <div className="field">
            <label>Sabab (ixtiyoriy)</label>
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Masalan: yetkazib beruvchidan kirim" />
          </div>
          {error && <p className="small" style={{ color: 'var(--color-danger)' }}>{error}</p>}
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setEditing(null)}>Bekor</button>
            <button className="btn btn-primary" onClick={saveMovement}>Saqlash</button>
          </div>
        </Modal>
      )}
    </>
  );
}
