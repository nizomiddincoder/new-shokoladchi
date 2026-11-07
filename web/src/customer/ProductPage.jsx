import React, { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useCatalog, useCart, useFavorites } from './CustomerApp';
import { money } from '../lib/format';
import { imgUrl } from '../lib/api';
import { IconChevronLeft, IconHeart, Logo } from '../components/Icons';
import { haptic } from '../lib/telegram';

// Mahsulot kartochkasi: rasm, tavsif, miqdor tanlash, pastki "Savatga qo'shish"
export default function ProductPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { products } = useCatalog();
  const { add } = useCart();
  const { ids, toggle } = useFavorites();
  const [qty, setQty] = useState(1);

  const p = products.find((x) => x.id === Number(id));
  if (!p) {
    return (
      <div className="page" style={{ textAlign: 'center', paddingTop: 60 }}>
        <p className="muted">Mahsulot topilmadi</p>
        <Link className="btn btn-primary" to="/">Orqaga</Link>
      </div>
    );
  }

  const fav = ids.has(p.id);
  const out = p.stock !== null && p.stock <= 0;

  return (
    <div style={{ paddingBottom: 140 }}>
      {/* Rasm va orqaga tugmasi */}
      <div style={{ position: 'relative' }}>
        {p.image_url ? (
          <img src={imgUrl(p.image_url)} alt={p.name} style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div className="img-placeholder" style={{ aspectRatio: '1/1' }}><Logo size={64} /></div>
        )}
        <button
          className="btn"
          style={{ position: 'absolute', top: 12, left: 12, padding: 8, borderRadius: 999, background: 'var(--color-surface)' }}
          onClick={() => nav(-1)}
          aria-label="Orqaga"
        >
          <IconChevronLeft size={20} />
        </button>
        <button
          className="btn"
          style={{ position: 'absolute', top: 12, right: 12, padding: 8, borderRadius: 999, background: 'var(--color-surface)' }}
          onClick={() => { toggle(p.id); haptic(); }}
          aria-label="Sevimlilarga"
        >
          <IconHeart size={20} style={{ color: fav ? 'var(--color-primary-600)' : 'var(--color-text-muted)', fill: fav ? 'var(--color-primary-600)' : 'none' }} />
        </button>
      </div>

      <div className="page" style={{ maxWidth: 520 }}>
        <h1 className="h1" style={{ fontSize: 20 }}>{p.name}</h1>
        <div className="money" style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-primary-600)', margin: '8px 0' }}>
          {money(p.price)}
        </div>
        {p.description && <p className="muted" style={{ marginTop: 4 }}>{p.description}</p>}
        {p.stock !== null && (
          <p className="small" style={{ color: out ? 'var(--color-danger)' : 'var(--color-success)', fontWeight: 600 }}>
            {out ? 'Tugagan' : `Qoldiq: ${p.stock} dona`}
          </p>
        )}
      </div>

      {/* Yopiq pastki tugma: miqdor + "Savatga qo'shish" */}
      <div className="sticky-cta">
        <div className="row" style={{ maxWidth: 520, margin: '0 auto' }}>
          <div className="stepper">
            <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Kamaytirish">−</button>
            <span className="stepper-val">{qty}</span>
            <button onClick={() => setQty((q) => Math.min(99, q + 1))} aria-label="Oshirish">+</button>
          </div>
          <button
            className="btn btn-primary"
            style={{ flex: 1 }}
            disabled={out}
            onClick={() => { add(p, qty); haptic('medium'); nav('/cart'); }}
          >
            Savatga qo'shish · <span className="money">{money(p.price * qty)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
