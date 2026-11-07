import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from './CustomerApp';
import { money } from '../lib/format';
import { imgUrl } from '../lib/api';
import { IconTrash, Logo } from '../components/Icons';
import { haptic } from '../lib/telegram';

// Savat: mahsulot kartochkalari, promokod (MVP'da faol emas), xulosalar
export default function CartPage() {
  const { items, setQty, remove, sum, count } = useCart();
  const nav = useNavigate();
  const [promo, setPromo] = useState('');

  if (items.length === 0) {
    return (
      <div className="page" style={{ textAlign: 'center', paddingTop: 60, maxWidth: 420 }}>
        <p className="muted">Savatcha bo'sh</p>
        <Link className="btn btn-primary" to="/">Katalogga o'tish</Link>
      </div>
    );
  }

  return (
    <div className="page" style={{ maxWidth: 520 }}>
      <h1 className="h1 mb-4">Savat <span className="muted small num">({count})</span></h1>

      <div className="stack">
        {items.map(({ product, qty }) => (
          <div key={product.id} className="card card-pad row" style={{ gap: 12 }}>
            {product.image_url ? (
              <img src={imgUrl(product.image_url)} alt={product.name} style={{ width: 60, height: 60, borderRadius: 12, objectFit: 'cover' }} />
            ) : (
              <div className="img-placeholder" style={{ width: 60, height: 60, borderRadius: 12 }}><Logo size={22} /></div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{product.name}</div>
              <div className="money small muted">{money(product.price)}</div>
              <div className="row" style={{ marginTop: 6 }}>
                <div className="stepper">
                  <button onClick={() => { setQty(product.id, qty - 1); haptic(); }} aria-label="Kamaytirish">−</button>
                  <span className="stepper-val">{qty}</span>
                  <button onClick={() => { setQty(product.id, qty + 1); haptic(); }} aria-label="Oshirish">+</button>
                </div>
                <button className="btn btn-danger btn-sm" onClick={() => { remove(product.id); haptic(); }} aria-label="O'chirish">
                  <IconTrash size={16} />
                </button>
              </div>
            </div>
            <div className="money" style={{ fontWeight: 700 }}>{money(product.price * qty)}</div>
          </div>
        ))}
      </div>

      {/* Promokod — keyingi bosqichda ishlaydi */}
      <div className="row mb-4" style={{ marginTop: 16 }}>
        <input
          className="input"
          placeholder="Promokod (tez orada)"
          value={promo}
          onChange={(e) => setPromo(e.target.value)}
          disabled
        />
      </div>

      {/* Xulosa */}
      <div className="card card-pad">
        <div className="row-between mb-2">
          <span className="muted">Mahsulotlar</span>
          <span className="money">{money(sum)}</span>
        </div>
        <div className="row-between mb-2">
          <span className="muted">Yetkazib berish</span>
          <span className="muted small">keyingi qadamda</span>
        </div>
        <div className="row-between" style={{ fontWeight: 700, fontSize: 17 }}>
          <span>Umumiy</span>
          <span className="money" style={{ color: 'var(--color-primary-600)' }}>{money(sum)}</span>
        </div>
      </div>

      <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} onClick={() => nav('/checkout')}>
        Buyurtma berish
      </button>
    </div>
  );
}
