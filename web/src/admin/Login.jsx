import React, { useState } from 'react';
import { api } from '../lib/api';
import { Logo } from '../components/Icons';

// Admin kirish: login + parol
export default function Login({ onLogin }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const d = await api('/api/admin/login', { method: 'POST', body: { login, password } });
      localStorage.setItem('admin_token', d.token);
      onLogin(d.token);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, background: 'var(--color-bg)',
    }}>
      <form onSubmit={submit} className="card card-pad" style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <Logo size={44} />
          <h1 className="h1" style={{ marginTop: 12 }}>Shokoladchi Admin</h1>
          <p className="muted small">Boshqaruv paneliga kirish</p>
        </div>
        <div className="field">
          <label>Login</label>
          <input className="input" value={login} onChange={(e) => setLogin(e.target.value)} autoFocus autoComplete="username" />
        </div>
        <div className="field">
          <label>Parol</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </div>
        <button className="btn btn-primary btn-block" disabled={busy}>Kirish</button>
        {error && <p className="small" style={{ color: 'var(--color-danger)', textAlign: 'center', marginBottom: 0 }}>{error}</p>}
      </form>
    </div>
  );
}
