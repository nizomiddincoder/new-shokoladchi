import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Modal, Empty } from '../components/ui';
import { IconPencil, IconPlus } from '../components/Icons';

// Kategoriyalar: ro'yxat, tartib raqami, qo'shish/tahrirlash/o'chirish
export default function Categories({ token }) {
  const [categories, setCategories] = useState(null);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');

  function reload() {
    api('/api/admin/categories', { token }).then((d) => setCategories(d.categories)).catch(() => setCategories([]));
  }
  useEffect(reload, [token]);

  async function save() {
    setError('');
    try {
      if (editing.id) await api(`/api/admin/categories/${editing.id}`, { method: 'PUT', token, body: editing });
      else await api('/api/admin/categories', { method: 'POST', token, body: editing });
      setEditing(null);
      reload();
    } catch (e) { setError(e.message); }
  }

  async function remove(c) {
    if (!confirm(`"${c.name}" o'chirilsinmi?`)) return;
    try {
      await api(`/api/admin/categories/${c.id}`, { method: 'DELETE', token });
      reload();
    } catch (e) { alert(e.message); }
  }

  return (
    <>
      <div className="row-between mb-4">
        <h1 className="h2">Kategoriyalar</h1>
        <button className="btn btn-primary" onClick={() => setEditing({ name: '', sort_order: 0 })}><IconPlus size={16} /> Qo'shish</button>
      </div>

      {!categories ? <div className="skeleton" style={{ height: 160 }} /> : categories.length === 0 ? <Empty /> : (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>Nomi</th><th className="right">Tartib</th><th>Holat</th><th></th></tr></thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td className="right num">{c.sort_order}</td>
                  <td><span className={`badge ${c.is_active ? 'badge-success' : 'badge-neutral'}`}>{c.is_active ? 'Faol' : 'Faol emas'}</span></td>
                  <td className="right" style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditing({ ...c })}><IconPencil size={15} /></button>
                    <button className="btn btn-danger btn-sm" onClick={() => remove(c)}>O'chirish</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal title={editing.id ? 'Kategoriyani tahrirlash' : 'Yangi kategoriya'} onClose={() => setEditing(null)}>
          <div className="field">
            <label>Nomi</label>
            <input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          </div>
          <div className="grid2">
            <div className="field">
              <label>Tartib raqami</label>
              <input className="input num" type="number" value={editing.sort_order ?? 0} onChange={(e) => setEditing({ ...editing, sort_order: e.target.value })} />
            </div>
            {editing.id !== undefined && (
              <div className="field">
                <label>Holat</label>
                <label className="row" style={{ cursor: 'pointer', paddingTop: 10 }}>
                  <input type="checkbox" checked={!!editing.is_active} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked ? 1 : 0 })} />
                  Faol
                </label>
              </div>
            )}
          </div>
          {error && <p className="small" style={{ color: 'var(--color-danger)' }}>{error}</p>}
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setEditing(null)}>Bekor</button>
            <button className="btn btn-primary" onClick={save}>Saqlash</button>
          </div>
        </Modal>
      )}
    </>
  );
}
