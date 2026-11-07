import React, { useState } from 'react';
import { api } from '../lib/api';
import { formatPhone } from '../lib/format';

// Profil: ism va telefonni ko'rish/tahrirlash
export default function Profile({ user, token, onSaved }) {
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setSaved(false); setError('');
    setBusy(true);
    try {
      const d = await api('/api/customer/profile', { method: 'PATCH', token, body: { name, phone } });
      onSaved(d.user);
      setSaved(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page" style={{ maxWidth: 420 }}>
      <h1 className="h1 mb-4">Profil</h1>
      <div className="card card-pad">
        <div className="field">
          <label>Ism</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Telefon</label>
          <input className="input num" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998901234567" inputMode="tel" />
          {phone && <span className="small muted">{formatPhone(phone)}</span>}
        </div>
        <button className="btn btn-primary btn-block" onClick={save} disabled={busy}>Saqlash</button>
        {saved && <p className="small" style={{ color: 'var(--color-success)' }}>Saqlandi ✅</p>}
        {error && <p className="small" style={{ color: 'var(--color-danger)' }}>{error}</p>}
      </div>
      <p className="small muted" style={{ textAlign: 'center', marginTop: 16 }}>
        Shokoladchi · Telegram Mini App
      </p>
    </div>
  );
}
