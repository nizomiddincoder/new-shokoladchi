// Auth holatlarini tez tekshirish: scripts\auth-test.js (server PORT=3222 da ishlayapti deb)
const fs = require('fs');
const initData = fs.readFileSync(process.env.TEMP + '/initdata.txt', 'utf8');
const BASE = 'http://localhost:3222';

(async () => {
  // 1) To'g'ri imzo -> 200 + token
  let r = await fetch(BASE + '/api/customer/auth', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData }),
  });
  let d = await r.json();
  console.log(r.status === 200 && d.token
    ? `OK togri imzo: 200, token bor (user=${d.user.name})`
    : `XATO togri imzo: ${r.status} ${JSON.stringify(d)}`);

  // 2) Imzo buzilgan (bad_hash) -> aniq xabar
  const bad = initData.replace(/hash=[0-9a-f]{64}/, 'hash=' + '0'.repeat(64));
  r = await fetch(BASE + '/api/customer/auth', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData: bad }),
  });
  d = await r.json();
  console.log(r.status === 401 ? `OK buzilgan imzo: 401, "${d.error.slice(0, 70)}"` : `XATO: ${r.status} ${JSON.stringify(d)}`);

  // 3) initData umuman yo'q (oddiy brauzerda ochilgan) -> no_initdata xabari
  r = await fetch(BASE + '/api/customer/auth', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  d = await r.json();
  console.log(r.status === 401 ? `OK bosh initData: 401, "${d.error.slice(0, 70)}"` : `XATO: ${r.status} ${JSON.stringify(d)}`);
})().catch((e) => { console.error('test xatosi:', e.message); process.exit(1); });
