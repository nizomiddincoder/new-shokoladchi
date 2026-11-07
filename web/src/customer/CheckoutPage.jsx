import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useCart } from './CustomerApp';
import { api } from '../lib/api';
import { money, gmapsUrl, ymapsUrl } from '../lib/format';
import { requestLocation, haptic } from '../lib/telegram';
import { IconPin, IconStore, IconBike, IconCheck } from '../components/Icons';

// Leaflet'ga asoslangan oddiy xarita tanlagich (modal)
function MapModal({ lat, lng, onPick, onClose }) {
  const el = useRef(null);
  const [pos, setPos] = useState({ lat: lat || 41.3111, lng: lng || 69.2797 });
  const [noMap, setNoMap] = useState(false);

  useEffect(() => {
    const L = window.L;
    if (!L || !el.current) { setNoMap(true); return; }
    const map = L.map(el.current).setView([pos.lat, pos.lng], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
    }).addTo(map);
    let marker = null;
    const place = (p) => {
      setPos(p);
      if (marker) marker.setLatLng([p.lat, p.lng]);
      else marker = L.marker([p.lat, p.lng]).addTo(map);
    };
    map.on('click', (e) => place({ lat: e.latlng.lat, lng: e.latlng.lng }));
    return () => map.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <h3>Xaritadan manzilni tanlash</h3>
        {noMap ? (
          <p className="muted">Xarita yuklanmadi. Iltimos, «Joriy lokatsiya» tugmasidan foydalaning.</p>
        ) : (
          <>
            <div ref={el} style={{ height: 320, borderRadius: 12, overflow: 'hidden', marginBottom: 12 }} />
            <div className="small muted mb-2 num">{pos.lat.toFixed(5)}, {pos.lng.toFixed(5)}</div>
          </>
        )}
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Bekor</button>
          <button className="btn btn-primary" disabled={noMap} onClick={() => onPick(pos)}>
            <IconCheck size={16} /> Tanlash
          </button>
        </div>
      </div>
    </div>
  );
}

// Buyurtmani rasmiylashtirish: yetkazish turi, lokatsiya/filial, izoh
export default function CheckoutPage({ token }) {
  const { items, sum, clear } = useCart();
  const nav = useNavigate();
  const [type, setType] = useState('delivery'); // delivery | pickup
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState(null);
  const [lat, setLat] = useState(null);
  const [lng, setLng] = useState(null);
  const [note, setNote] = useState('');
  const [showMap, setShowMap] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/api/customer/branches', { token }).then((d) => {
      setBranches(d.branches);
      if (d.branches.length) setBranchId(d.branches[0].id);
    }).catch(() => {});
  }, [token]);

  if (items.length === 0) {
    return (
      <div className="page" style={{ textAlign: 'center', paddingTop: 60 }}>
        <p className="muted">Savatcha bo'sh</p>
        <Link className="btn btn-primary" to="/">Katalogga o'tish</Link>
      </div>
    );
  }

  async function shareCurrentLocation() {
    setError('');
    try {
      const loc = await requestLocation();
      setLat(loc.latitude);
      setLng(loc.longitude);
      haptic('medium');
    } catch {
      setError('Lokatsiya olinmadi. Xaritadan tanlang yoki Telegram ilovasini yangilang.');
    }
  }

  async function submit() {
    setError('');
    setBusy(true);
    try {
      const body = {
        items: items.map((x) => ({ product_id: x.product.id, qty: x.qty })),
        delivery_type: type,
        address_note: note,
      };
      if (type === 'pickup') body.branch_id = branchId;
      else { body.lat = lat; body.lng = lng; }
      const order = await api('/api/customer/orders', { method: 'POST', token, body });
      clear();
      haptic('heavy');
      nav(`/orders/${order.id}`, { state: { justCreated: true } });
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="page" style={{ maxWidth: 520 }}>
      <h1 className="h1 mb-4">Buyurtmani rasmiylashtirish</h1>

      {/* 1. Yetkazish turi */}
      <div className="grid2 mb-4">
        <button
          className="card card-pad"
          style={{ cursor: 'pointer', borderColor: type === 'delivery' ? 'var(--color-primary-600)' : undefined, background: type === 'delivery' ? 'var(--color-primary-100)' : undefined }}
          onClick={() => setType('delivery')}
        >
          <IconBike size={22} style={{ color: 'var(--color-primary-600)' }} />
          <div style={{ fontWeight: 700, marginTop: 6 }}>Yetkazib berish</div>
          <div className="small muted">Lokatsiyangizni yuboring</div>
        </button>
        <button
          className="card card-pad"
          style={{ cursor: 'pointer', borderColor: type === 'pickup' ? 'var(--color-primary-600)' : undefined, background: type === 'pickup' ? 'var(--color-primary-100)' : undefined }}
          onClick={() => setType('pickup')}
        >
          <IconStore size={22} style={{ color: 'var(--color-primary-600)' }} />
          <div style={{ fontWeight: 700, marginTop: 6 }}>Olib ketish</div>
          <div className="small muted">Filialdan olib keting</div>
        </button>
      </div>

      {/* 2a. Yetkazib berish: lokatsiya + izoh */}
      {type === 'delivery' && (
        <div className="card card-pad mb-4">
          <div className="h2 mb-2">Yetkazish manzili</div>
          <div className="row mb-2">
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={shareCurrentLocation}>
              <IconPin size={18} /> Joriy lokatsiya
            </button>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowMap(true)}>
              Xaritadan tanlash
            </button>
          </div>
          {lat && lng ? (
            <div className="row-between small num" style={{ background: 'var(--color-primary-100)', borderRadius: 10, padding: '8px 12px' }}>
              <span>{lat.toFixed(5)}, {lng.toFixed(5)}</span>
              <a href={gmapsUrl(lat, lng)} target="_blank" rel="noreferrer">Xaritada ko'rish</a>
            </div>
          ) : (
            <p className="small muted">Manzil tanlanmagan</p>
          )}
          <div className="field" style={{ marginTop: 12 }}>
            <label>Manzil izohi (kiraverish, qavat, mo'ljal)</label>
            <textarea
              className="textarea"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Masalan: 2-podyezd, 4-qavat, domofon 15"
            />
          </div>
        </div>
      )}

      {/* 2b. Olib ketish: filial tanlash */}
      {type === 'pickup' && (
        <div className="card card-pad mb-4">
          <div className="h2 mb-2">Filialni tanlang</div>
          {branches.map((b) => (
            <label
              key={b.id}
              className="row"
              style={{
                gap: 10, padding: 12, borderRadius: 12, cursor: 'pointer', marginBottom: 8,
                background: branchId === b.id ? 'var(--color-primary-100)' : 'transparent',
                border: `1px solid ${branchId === b.id ? 'var(--color-primary-600)' : 'var(--color-border)'}`,
              }}
            >
              <input type="radio" name="branch" checked={branchId === b.id} onChange={() => setBranchId(b.id)} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{b.name}</div>
                <div className="small muted">{b.address}</div>
                {b.phone && <div className="small muted num">{b.phone}</div>}
              </div>
              {b.lat && b.lng && (
                <a href={gmapsUrl(b.lat, b.lng)} target="_blank" rel="noreferrer" className="small" style={{ color: 'var(--color-primary-600)' }}>
                  Xaritada
                </a>
              )}
            </label>
          ))}
          {branches.length === 0 && <p className="muted small">Filiallar mavjud emas</p>}
        </div>
      )}

      {/* 3. Xulosa va tasdiqlash */}
      <div className="card card-pad">
        <div className="row-between mb-2">
          <span className="muted">Mahsulotlar ({items.reduce((a, x) => a + x.qty, 0)})</span>
          <span className="money">{money(sum)}</span>
        </div>
        <div className="row-between" style={{ fontWeight: 700, fontSize: 17 }}>
          <span>Umumiy</span>
          <span className="money" style={{ color: 'var(--color-primary-600)' }}>{money(sum)}</span>
        </div>
        <p className="small muted" style={{ margin: '8px 0 0' }}>
          Yetkazib berish narxi operator tomonidan buyurtmani tasdiqlashda qo'shiladi.
        </p>
      </div>

      {error && <p className="small" style={{ color: 'var(--color-danger)', marginTop: 12 }}>{error}</p>}

      <button
        className="btn btn-primary btn-block"
        style={{ marginTop: 16 }}
        onClick={submit}
        disabled={busy || (type === 'delivery' && (!lat || !lng)) || (type === 'pickup' && !branchId)}
      >
        <span className="money">Buyurtmani tasdiqlash · {money(sum)}</span>
      </button>

      {showMap && (
        <MapModal
          lat={lat} lng={lng}
          onClose={() => setShowMap(false)}
          onPick={(p) => { setLat(p.lat); setLng(p.lng); setShowMap(false); haptic(); }}
        />
      )}
    </div>
  );
}
