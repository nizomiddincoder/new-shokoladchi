import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCatalog, useCart, useFavorites } from './CustomerApp';
import { money } from '../lib/format';
import { imgUrl } from '../lib/api';
import { IconSearch, IconPlus, IconHeart, Logo } from '../components/Icons';
import { haptic } from '../lib/telegram';

function ProductCard({ p }) {
  const { add } = useCart();
  const { ids, toggle } = useFavorites();
  const nav = useNavigate();
  const fav = ids.has(p.id);
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => nav(`/product/${p.id}`)}>
        {p.image_url ? (
          <img src={imgUrl(p.image_url)} alt={p.name} style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div className="img-placeholder" style={{ aspectRatio: '1/1' }}><Logo size={40} /></div>
        )}
        <button
          className="btn btn-ghost"
          style={{ position: 'absolute', top: 6, right: 6, padding: 6, borderRadius: 999, background: 'var(--color-surface)' }}
          onClick={(e) => { e.stopPropagation(); toggle(p.id); haptic(); }}
          aria-label="Sevimlilarga"
        >
          <IconHeart size={18} style={{ color: fav ? 'var(--color-primary-600)' : 'var(--color-text-muted)', fill: fav ? 'var(--color-primary-600)' : 'none' }} />
        </button>
      </div>
      <div style={{ padding: 12 }}>
        <div style={{ fontWeight: 600, fontSize: 14, minHeight: 40 }}>{p.name}</div>
        <div className="row-between" style={{ marginTop: 8 }}>
          <span className="money" style={{ fontWeight: 700, color: 'var(--color-primary-600)' }}>{money(p.price)}</span>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => { add(p); haptic(); }}
            aria-label="Savatga qo'shish"
          >
            <IconPlus size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

// Bosh sahifa: qidiruv, kategoriya chiplari, promo banner, bestsellers
export default function Home() {
  const { categories, products } = useCatalog();
  const [cat, setCat] = useState(0); // 0 = barchasi
  const [q, setQ] = useState('');

  const list = useMemo(() => {
    const byCat = cat ? products.filter((p) => p.category_id === cat) : products;
    const search = q.trim().toLowerCase();
    return search ? byCat.filter((p) => p.name.toLowerCase().includes(search)) : byCat;
  }, [products, cat, q]);

  return (
    <div className="page" style={{ maxWidth: 520 }}>
      {/* Sarlavha */}
      <div className="row mb-4" style={{ gap: 10 }}>
        <Logo size={34} />
        <div>
          <div className="h2">Shokoladchi</div>
          <div className="muted small">Eng shirin buyurtmalar shu yerda</div>
        </div>
      </div>

      {/* Qidiruv */}
      <div style={{ position: 'relative', marginBottom: 12 }}>
        <input
          className="input"
          placeholder="Mahsulot qidirish..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ paddingLeft: 40 }}
        />
        <IconSearch size={18} style={{ position: 'absolute', left: 13, top: 13, color: 'var(--color-text-muted)' }} />
      </div>

      {/* Kategoriya chiplari */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 12 }}>
        <button className={`chip${cat === 0 ? ' active' : ''}`} onClick={() => setCat(0)}>Barchasi</button>
        {categories.map((c) => (
          <button key={c.id} className={`chip${cat === c.id ? ' active' : ''}`} onClick={() => setCat(c.id)}>{c.name}</button>
        ))}
      </div>

      {/* Promo banner */}
      <div className="card" style={{
        marginBottom: 16, padding: '20px 16px',
        background: 'linear-gradient(120deg, var(--color-primary-600), var(--color-primary-400))',
        color: '#fff', border: 'none',
      }}>
        <div style={{ fontWeight: 700, fontSize: 17 }}>Yangi mahsulotlar har hafta</div>
        <div style={{ opacity: .85, fontSize: 14, marginTop: 4 }}>Yangi truffellar to'plami savatga chiqdi — sinab ko'ring!</div>
      </div>

      {/* Mahsulotlar */}
      {list.length === 0 ? (
        <p className="muted" style={{ textAlign: 'center' }}>Mahsulot topilmadi</p>
      ) : (
        <div className="grid2">
          {list.map((p) => <ProductCard key={p.id} p={p} />)}
        </div>
      )}
    </div>
  );
}
