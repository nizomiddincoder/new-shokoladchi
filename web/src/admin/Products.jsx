import React, { useEffect, useState } from 'react';
import { api, uploadImage, imgUrl } from '../lib/api';
import { money } from '../lib/format';
import { Modal, Empty } from '../components/ui';
import { IconPencil, IconPlus, Logo } from '../components/Icons';

const EMPTY = { name: '', category_id: '', description: '', price: '', stock: '', min_level: 0, image_url: '', is_active: 1 };

// Mahsulotlar: ro'yxat + qo'shish/tahrirlash (rasm yuklash bilan)
export default function Products({ token }) {
  const [products, setProducts] = useState(null);
  const [categories, setCategories] = useState([]);
  const [editing, setEditing] = useState(null); // null | EMPTY | product
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function reload() {
    api('/api/admin/products', { token }).then((d) => setProducts(d.products)).catch(() => setProducts([]));
  }
  useEffect(() => {
    reload();
    api('/api/admin/categories', { token }).then((d) => setCategories(d.categories)).catch(() => {});
  }, [token]);

  async function save() {
    setBusy(true); setError('');
    try {
      const body = { ...editing, is_active: !!editing.is_active };
      if (editing.id) await api(`/api/admin/products/${editing.id}`, { method: 'PUT', token, body });
      else await api('/api/admin/products', { method: 'POST', token, body });
      setEditing(null);
      reload();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function deactivate(p) {
    if (!confirm(`"${p.name}" faol emas qilinsinmi?`)) return;
    await api(`/api/admin/products/${p.id}`, { method: 'DELETE', token });
    reload();
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const url = await uploadImage(file, token);
      setEditing((s) => ({ ...s, image_url: url }));
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <>
      <div className="row-between mb-4">
        <h1 className="h2">Mahsulotlar</h1>
        <button className="btn btn-primary" onClick={() => setEditing({ ...EMPTY })}><IconPlus size={16} /> Qo'shish</button>
      </div>

      {!products ? <div className="skeleton" style={{ height: 200 }} /> : products.length === 0 ? <Empty /> : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr><th>Rasm</th><th>Nomi</th><th>Kategoriya</th><th className="right">Narx</th><th className="right">Qoldiq</th><th>Holat</th><th></th></tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td style={{ width: 52 }}>
                    {p.image_url ? (
                      <img src={imgUrl(p.image_url)} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover' }} />
                    ) : (
                      <div className="img-placeholder" style={{ width: 40, height: 40, borderRadius: 8 }}><Logo size={16} /></div>
                    )}
                  </td>
                  <td style={{ fontWeight: 600 }}>{p.name}{!p.is_active ? <span className="muted small"> (faol emas)</span> : null}</td>
                  <td className="muted">{p.category_name || '—'}</td>
                  <td className="right money">{money(p.price)}</td>
                  <td className="right num">{p.stock === null ? '—' : p.stock}</td>
                  <td><span className={`badge ${p.is_active ? 'badge-success' : 'badge-neutral'}`}>{p.is_active ? 'Faol' : 'Faol emas'}</span></td>
                  <td className="right" style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditing({ ...p, is_active: !!p.is_active })}><IconPencil size={15} /></button>
                    {p.is_active ? <button className="btn btn-danger btn-sm" onClick={() => deactivate(p)}>Faol emas</button> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal title={editing.id ? 'Mahsulotni tahrirlash' : 'Yangi mahsulot'} onClose={() => setEditing(null)}>
          {editing.image_url && (
            <img src={imgUrl(editing.image_url)} alt="" style={{ width: 80, height: 80, borderRadius: 12, objectFit: 'cover', marginBottom: 12 }} />
          )}
          <div className="field">
            <label>Rasm</label>
            <input className="input" type="file" accept="image/*" onChange={onFile} />
          </div>
          <div className="field">
            <label>Nomi</label>
            <input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          </div>
          <div className="field">
            <label>Kategoriya</label>
            <select className="select" value={editing.category_id} onChange={(e) => setEditing({ ...editing, category_id: e.target.value })}>
              <option value="">Tanlang...</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Tavsif</label>
            <textarea className="textarea" value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
          </div>
          <div className="grid2">
            <div className="field">
              <label>Narx, so'm</label>
              <input className="input num" type="number" min="0" value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} />
            </div>
            <div className="field">
              <label>Qoldiq (bo'sh = kuzatilmaydi)</label>
              <input className="input num" type="number" min="0" value={editing.stock ?? ''} onChange={(e) => setEditing({ ...editing, stock: e.target.value })} />
            </div>
          </div>
          <div className="grid2">
            <div className="field">
              <label>Minimal qoldiq (ogohlantirish)</label>
              <input className="input num" type="number" min="0" value={editing.min_level ?? 0} onChange={(e) => setEditing({ ...editing, min_level: e.target.value })} />
            </div>
            <div className="field">
              <label>Holat</label>
              <label className="row" style={{ cursor: 'pointer', paddingTop: 10 }}>
                <input type="checkbox" checked={!!editing.is_active} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked ? 1 : 0 })} />
                Faol
              </label>
            </div>
          </div>
          {error && <p className="small" style={{ color: 'var(--color-danger)' }}>{error}</p>}
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setEditing(null)}>Bekor</button>
            <button className="btn btn-primary" onClick={save} disabled={busy}>Saqlash</button>
          </div>
        </Modal>
      )}
    </>
  );
}
