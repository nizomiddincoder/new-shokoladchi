import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useCatalog, useCart, useFavorites } from './CustomerApp';
import { money } from '../lib/format';
import { imgUrl } from '../lib/api';
import { IconHeart, IconPlus, Logo } from '../components/Icons';
import { haptic } from '../lib/telegram';

// Sevimlilar: localStorage'da saqlangan mahsulotlar
export default function Favorites() {
  const { products } = useCatalog();
  const { ids, toggle } = useFavorites();
  const { add } = useCart();

  const list = useMemo(() => products.filter((p) => ids.has(p.id)), [products, ids]);

  if (list.length === 0) {
    return (
      <div className="page" style={{ textAlign: 'center', paddingTop: 60, maxWidth: 420 }}>
        <p className="muted">Sevimlilar ro'yxati bo'sh. Mahsulot kartochkasidagi ♡ belgisini bosing.</p>
        <Link className="btn btn-primary" to="/">Katalogga o'tish</Link>
      </div>
    );
  }

  return (
    <div className="page" style={{ maxWidth: 520 }}>
      <h1 className="h1 mb-4">Sevimlilar</h1>
      <div className="stack">
        {list.map((p) => (
          <div key={p.id} className="card card-pad row" style={{ gap: 12 }}>
            {p.image_url ? (
              <img src={imgUrl(p.image_url)} alt={p.name} style={{ width: 64, height: 64, borderRadius: 12, objectFit: 'cover' }} />
            ) : (
              <div className="img-placeholder" style={{ width: 64, height: 64, borderRadius: 12 }}><Logo size={24} /></div>
            )}
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
              <div className="money" style={{ fontWeight: 700, color: 'var(--color-primary-600)' }}>{money(p.price)}</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => { toggle(p.id); haptic(); }} aria-label="O'chirish">
              <IconHeart size={18} style={{ color: 'var(--color-primary-600)', fill: 'var(--color-primary-600)' }} />
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => { add(p); haptic(); }} aria-label="Savatga">
              <IconPlus size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
