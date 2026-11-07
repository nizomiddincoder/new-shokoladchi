import React, { useState } from 'react';
import { api } from '../lib/api';
import { Logo } from '../components/Icons';

const PHONE_RE = /^\+998\d{9}$/;

// Birinchi kirish: ism + telefon (Telegram "Raqamni ulashish" yoki qo'lda)
export default function Onboarding({ user, token, onDone }) {
  const [name, setName] = useState(user.name || '');
  const [phone, setPhone] = useState(user.phone || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);

  // 1-usul: Telegram orqali raqam ulashish — bot kontakt oladi, biz so'raymiz
  async function sharePhone() {
    setError('');
    const w = window.Telegram?.WebApp;
    if (!w || typeof w.requestContact !== 'function') {
      setManual(true);
      setError('Bu yerda raqam ulashish mavjud emas — iltimos, qo‘lda kiriting.');
      return;
    }
    setBusy(true);
    let found = false;
    try {
      w.requestContact();
      // Kontakt botga boradi, biz 10 sekund ichida bir necha marta so'raymiz
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        try {
          const d = await api('/api/customer/contact-share', { token });
          if (d.phone) { setPhone(d.phone); setManual(true); found = true; break; }
        } catch { /* keyingi urinish */ }
      }
    } finally {
      setBusy(false);
      if (!found) setError('Raqam kelmedi — iltimos, qo‘lda kiriting.');
    }
  }

  async function save() {
    setError('');
    if (!name.trim()) return setError('Ismingizni kiriting');
    if (!PHONE_RE.test(phone)) return setError('Telefon formati: +998XXXXXXXXX');
    setBusy(true);
    try {
      const d = await api('/api/customer/profile', { method: 'PATCH', token, body: { name, phone } });
      onDone(d.user);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page" style={{ paddingTop: 48, maxWidth: 420 }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <Logo size={56} />
        <h1 className="h1" style={{ marginTop: 16 }}>Xush kelibsiz!</h1>
        <p className="muted">Buyurtma berish uchun ma'lumotlaringizni kiriting</p>
      </div>

      <div className="card card-pad">
        <div className="field">
          <label>Ism</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ismingiz" />
        </div>

        <div className="field">
          <label>Telefon</label>
          <input className="input num" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998901234567" inputMode="tel" />
        </div>

        {!manual && (
          <button className="btn btn-secondary btn-block" style={{ marginBottom: 12 }} onClick={sharePhone} disabled={busy}>
            Raqamni ulashish
          </button>
        )}

        <button className="btn btn-primary btn-block" onClick={save} disabled={busy}>Davom etish</button>
        {error && <p className="small" style={{ color: 'var(--color-danger)' }}>{error}</p>}
      </div>
    </div>
  );
}
