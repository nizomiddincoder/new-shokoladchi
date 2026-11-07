// Smoke test: asosiy oqimlarni tez tekshirish (lokaldagi ishlaydigan serverga qarshi)
// Ishga tushirish:  DEV_AUTH=1 PORT=3111 node src/index.js  -> keyin  node scripts/smoke-test.js
// Windows (cmd):    set DEV_AUTH=1 && set PORT=3111 && node src/index.js
/* eslint-disable no-console */
const BASE = process.env.SMOKE_URL || 'http://localhost:3111';

async function j(path, opt = {}) {
  const res = await fetch(BASE + path, {
    ...opt,
    headers: { 'Content-Type': 'application/json', ...(opt.headers || {}) },
  });
  return [res.status, await res.json().catch(() => null)];
}

async function main() {
  const ok = (name, cond, extra = '') => {
    console.log(`${cond ? '✅' : '❌'} ${name} ${extra}`);
    if (!cond) process.exitCode = 1;
  };

  // 1. Health
  const [hs] = await j('/api/health');
  ok('health', hs === 200);

  // 2. Mijoz auth (DEV_AUTH=1 bo'lishi kerak)
  let [s, d] = await j('/api/customer/auth', { method: 'POST', body: '{}' });
  ok('mijoz auth', s === 200 && d.token, `(id=${d?.user?.id})`);
  const ctok = d.token;

  // 3. Profil
  [s, d] = await j('/api/customer/profile', {
    method: 'PATCH', headers: { Authorization: `Bearer ${ctok}` },
    body: JSON.stringify({ name: 'Ali', phone: '+998901112233' }),
  });
  ok('profil saqlash', s === 200 && d.user.phone === '+998901112233');

  // 4. Katalog
  [s, d] = await j('/api/customer/catalog');
  ok('katalog', s === 200 && d.products.length > 0, `(${d.products.length} mahsulot)`);
  const [p1, p2] = d.products;

  // 5. Buyurtma (yetkazib berish)
  [s, d] = await j('/api/customer/orders', {
    method: 'POST', headers: { Authorization: `Bearer ${ctok}` },
    body: JSON.stringify({
      items: [{ product_id: p1.id, qty: 2 }, { product_id: p2.id, qty: 1 }],
      delivery_type: 'delivery', lat: 41.31, lng: 69.27, address_note: '2-qavat, domofon 5',
    }),
  });
  ok('buyurtma yaratish', s === 200 && d.number, `(jami=${d?.total})`);
  const orderId = d.id;

  // 6. Admin login
  [s, d] = await j('/api/admin/login', { method: 'POST', body: JSON.stringify({ login: 'admin', password: 'admin123' }) });
  ok('admin login', s === 200 && d.token);
  const atok = d.token;

  // 7. Statistika
  [s, d] = await j('/api/admin/stats?period=week', { headers: { Authorization: `Bearer ${atok}` } });
  ok('statistika', s === 200 && d.orders_count >= 1, `(buyurtma=${d?.orders_count}, tushum=${d?.revenue})`);

  // 8. Holat + yetkazish narxi
  [s, d] = await j(`/api/admin/orders/${orderId}`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${atok}` },
    body: JSON.stringify({ status: 'preparing', delivery_price: 15000 }),
  });
  ok('holat o\'zgartirish', s === 200 && d.order.status === 'preparing', `(jami=${d?.order?.total})`);

  // 9. Mijoz buyurtmasini ko'radi
  [s, d] = await j(`/api/customer/orders/${orderId}`, { headers: { Authorization: `Bearer ${ctok}` } });
  ok('mijoz buyurtmasi', s === 200 && d.order.status === 'preparing' && d.items.length === 2);

  // 10. CSV eksport
  const res = await fetch(`${BASE}/api/admin/export/orders.csv?period=week`, { headers: { Authorization: `Bearer ${atok}` } });
  ok('CSV eksport', res.status === 200 && (await res.text()).includes('Mijoz'));

  // 11. Ombor kirim
  [s, d] = await j(`/api/admin/stock/${p1.id}/movement`, {
    method: 'POST', headers: { Authorization: `Bearer ${atok}` },
    body: JSON.stringify({ delta: 10, reason: 'smoke test' }),
  });
  ok('ombor kirim', s === 200 && typeof d.stock === 'number', `(yangi qoldiq=${d?.stock})`);

  // 12. Xavfsizlik: token'siz admin so'rovi rad etiladi
  const [us] = await j('/api/admin/orders');
  ok('admin himoyasi', us === 401);

  console.log('Smoke test yakunlandi.');
  process.exit(process.exitCode || 0);
}

main().catch((e) => { console.error('Smoke test xatosi:', e.message); process.exit(1); });
