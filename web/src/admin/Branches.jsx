import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { gmapsUrl } from '../lib/format';
import { Modal, Empty } from '../components/ui';
import { IconPencil, IconPlus } from '../components/Icons';

const EMPTY = { name: '', address: '', lat: '', lng: '', phone: '' };

// Filiallar (olib ketish uchun): CRUD
export default function Branches({ token }) {
  const [branches, setBranches] = useState(null);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');

  function reload() {
    api('/api/admin/branches', { token }).then((d) => setBranches(d.branches)).catch(() => setBranches([]));
  }
  useEffect(reload, [token]);

  async function save() {
    setError('');
    try {
      if (editing.id) await api(`/api/admin/branches/${editing.id}`, { method: 'PUT', token, body: editing });
      else await api('/api/admin/branches', { method: 'POST', token, body: editing });
      setEditing(null);
      reload();
    } catch (e) { setError(e.message); }
  }

  async function remove(b) {
    if (!confirm(`"${b.name}" o'chirilsinmi?`)) return;
    try {
      await api(`/api/admin/branches/${b.id}`, { method: 'DELETE', token });
      reload();
    } catch (e) { alert(e.message); }
  }

  return (
    <>
      <div className="row-between mb-4">
        <h1 className="h2">Filiallar</h1>
        <button className="btn btn-primary" onClick={() => setEditing({ ...EMPTY })}><IconPlus size={16} /> Qo'shish</button>
      </div>

      {!branches ? <div className="skeleton" style={{ height: 160 }} /> : branches.length === 0 ? <Empty /> : (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>Nomi</th><th>Manzil</th><th>Telefon</th><th>Lokatsiya</th><th></th></tr></thead>
            <tbody>
              {branches.map((b) => (
                <tr key={b.id}>
                  <td style={{ fontWeight: 600 }}>{b.name}</td>
                  <td className="muted">{b.address}</td>
                  <td className="num">{b.phone}</td>
                  <td>
                    {b.lat && b.lng
                      ? <a href={gmapsUrl(b.lat, b.lng)} target="_blank" rel="noreferrer" style={{ color: 'var(--color-primary-600)' }}>Xaritada ochish</a>
                      : '—'}
                  </td>
                  <td className="right" style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditing({ ...b })}><IconPencil size={15} /></button>
                    <button className="btn btn-danger btn-sm" onClick={() => remove(b)}>O'chirish</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal title={editing.id ? 'Filialni tahrirlash' : 'Yangi filial'} onClose={() => setEditing(null)}>
          <div className="field">
            <label>Nomi</label>
            <input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          </div>
          <div className="field">
            <label>Manzil</label>
            <input className="input" value={editing.address} onChange={(e) => setEditing({ ...editing, address: e.target.value })} />
          </div>
          <div className="grid2">
            <div className="field">
              <label>Kenglik (lat)</label>
              <input className="input num" value={editing.lat ?? ''} onChange={(e) => setEditing({ ...editing, lat: e.target.value })} placeholder="41.3111" />
            </div>
            <div className="field">
              <label>Uzunlik (lng)</label>
              <input className="input num" value={editing.lng ?? ''} onChange={(e) => setEditing({ ...editing, lng: e.target.value })} placeholder="69.2797" />
            </div>
          </div>
          <div className="field">
            <label>Telefon</label>
            <input className="input num" value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} placeholder="+998901234567" />
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
