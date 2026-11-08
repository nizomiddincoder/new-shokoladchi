// Mijoz qismi API'si (Telegram Mini App uchun)
const express = require('express');
const db = require('../db');
const { sign, requireCustomer } = require('../middleware/auth');
const { verifyInitData } = require('../telegram-init-data');
const { notifyAdmin } = require('../telegram');
const { orderNumber, money, newOrderText } = require('../order-utils');

const router = express.Router();
const PHONE_RE = /^\+998\d{9}$/;

// --- Kirish: initData imzosini tekshirib, foydalanuvchini topamiz/yaratamiz
router.post('/auth', (req, res) => {
  const initData = (req.body && req.body.initData) || '';
  const parsed = verifyInitData(initData, process.env.BOT_TOKEN || '');

  let tgId, tgName;
  if (parsed.ok) {
    const u = JSON.parse(parsed.data.user || '{}');
    tgId = String(u.id || '');
    tgName = u.first_name || u.username || '';
  } else if (process.env.DEV_AUTH === '1') {
    // Faqat lokal test uchun (Telegram'dan tashqarida brauzerda ochish)
    tgId = 'dev'; tgName = 'Test mijoz';
  } else {
    // Sababni aniq ko'rsatamiz — tashxis qo'yish uchun
    const reasons = {
      no_token: 'Serverda BOT_TOKEN sozlanmagan — Railway Variables ga qo\'shing',
      no_initdata: 'initData kelmadi — ilova Telegram Mini App sifatida ochilmagan (oddiy brauzer/link emas)',
      no_hash: 'initData formati buzilgan (hash yo\'q)',
      bad_hash: 'initData imzosi mos emas — BOT_TOKEN boshqa botga tegishli yoki xato kiritilgan',
      expired: 'initData eskirgan — Mini App ni yopib qayta oching',
    };
    return res.status(401).json({ error: reasons[parsed.reason] || 'initData tasdiqlanmadi' });
  }

  let user = db.prepare('SELECT id, telegram_id, name, phone FROM users WHERE telegram_id = ?').get(tgId);
  if (!user) {
    const info = db.prepare('INSERT INTO users (telegram_id, name) VALUES (?, ?)').run(tgId, tgName);
    user = db.prepare('SELECT id, telegram_id, name, phone FROM users WHERE id = ?').get(info.lastInsertRowid);
  }

  const token = sign({ type: 'customer', uid: user.id, tid: user.telegram_id });
  res.json({ token, user });
});

// --- Joriy profil
router.get('/me', requireCustomer, (req, res) => {
  const user = db.prepare('SELECT id, telegram_id, name, phone FROM users WHERE id = ?').get(req.customer.uid);
  if (!user) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
  res.json({ user });
});

// --- Profilni saqlash (ism, telefon)
router.patch('/profile', requireCustomer, (req, res) => {
  const { name, phone } = req.body || {};
  if (phone && !PHONE_RE.test(phone)) {
    return res.status(400).json({ error: 'Telefon formati: +998XXXXXXXXX' });
  }
  const cleanName = String(name || '').trim();
  if (!cleanName || cleanName.length > 60) {
    return res.status(400).json({ error: 'Ismni kiriting' });
  }
  db.prepare('UPDATE users SET name = ?, phone = COALESCE(?, phone) WHERE id = ?')
    .run(cleanName, phone || null, req.customer.uid);
  const user = db.prepare('SELECT id, telegram_id, name, phone FROM users WHERE id = ?').get(req.customer.uid);
  res.json({ user });
});

// --- "Raqamni ulashish" natijasini olish (bot kontakt olgandan keyin)
router.get('/contact-share', requireCustomer, (req, res) => {
  const row = db.prepare(
    'SELECT phone, created_at FROM contact_shares WHERE telegram_id = ? ORDER BY created_at DESC'
  ).get(req.customer.tid);

  if (row) {
    const ageSec = (Date.now() - new Date(row.created_at.replace(' ', 'T') + 'Z').getTime()) / 1000;
    if (ageSec < 180) return res.json({ phone: row.phone });
  }
  res.json({ phone: null });
});

// --- Katalog: kategoriyalar + mahsulotlar (faollar)
router.get('/catalog', (req, res) => {
  const categories = db.prepare(
    'SELECT id, name FROM categories WHERE is_active = 1 ORDER BY sort_order, id'
  ).all();
  const products = db.prepare(
    'SELECT id, category_id, name, description, price, image_url, stock FROM products WHERE is_active = 1 ORDER BY id'
  ).all();
  res.json({ categories, products });
});

// --- Filiallar (olib ketish uchun)
router.get('/branches', requireCustomer, (req, res) => {
  res.json({ branches: db.prepare('SELECT id, name, address, lat, lng, phone FROM branches ORDER BY id').all() });
});

// --- Buyurtma yaratish
router.post('/orders', requireCustomer, (req, res) => {
  const { items, delivery_type: deliveryType, branch_id: branchId, lat, lng, address_note: addressNote } = req.body || {};

  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Savatcha bo‘sh' });
  if (!['pickup', 'delivery'].includes(deliveryType)) return res.status(400).json({ error: 'Yetkazish turini tanlang' });

  let branch = null;
  if (deliveryType === 'pickup') {
    branch = branchId ? db.prepare('SELECT * FROM branches WHERE id = ?').get(Number(branchId)) : null;
    if (!branch) return res.status(400).json({ error: 'Filialni tanlang' });
  } else if (!lat || !lng) {
    return res.status(400).json({ error: 'Lokatsiyani yuboring yoki xaritadan tanlang' });
  }

  // Narx va qoldiqni faqat baza bo'yicha hisoblaymiz (mijoz kiritganini ishonchsiz)
  const getProduct = db.prepare('SELECT id, name, price, stock, is_active FROM products WHERE id = ?');
  let total = 0;
  const lines = [];
  for (const it of items) {
    const p = getProduct.get(Number(it.product_id));
    if (!p || !p.is_active) return res.status(400).json({ error: 'Mahsulot topilmadi yoki faol emas' });
    const qty = Math.max(1, Math.min(999, parseInt(it.qty, 10) || 1));
    if (p.stock !== null && p.stock < qty) {
      return res.status(400).json({ error: `"${p.name}" qoldiqda yetarli emas` });
    }
    lines.push({ product_id: p.id, name_snapshot: p.name, price_snapshot: p.price, qty });
    total += p.price * qty;
  }

  const userId = req.customer.uid;
  const insertOrder = db.prepare(
    `INSERT INTO orders (user_id, status, delivery_type, branch_id, lat, lng, address_note, total)
     VALUES (?, 'new', ?, ?, ?, ?, ?, ?)`
  );
  const insertItem = db.prepare(
    'INSERT INTO order_items (order_id, product_id, name_snapshot, price_snapshot, qty) VALUES (?,?,?,?,?)'
  );
  const decStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock IS NOT NULL');

  const orderId = db.transaction(() => {
    const o = insertOrder.run(
      userId, deliveryType,
      deliveryType === 'pickup' ? branch.id : null,
      deliveryType === 'delivery' ? Number(lat) : null,
      deliveryType === 'delivery' ? Number(lng) : null,
      String(addressNote || '').slice(0, 500),
      total
    );
    for (const l of lines) {
      insertItem.run(o.lastInsertRowid, l.product_id, l.name_snapshot, l.price_snapshot, l.qty);
      decStock.run(l.qty, l.product_id); // qoldiqni kamaytirish
    }
    return o.lastInsertRowid;
  })();

  // Adminga xabar (javobni bloklamaymiz)
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  notifyAdmin(newOrderText(orderId, {
    user, lines, total, deliveryType, branch,
    lat: deliveryType === 'delivery' ? lat : null,
    lng: deliveryType === 'delivery' ? lng : null,
    addressNote,
  }));

  res.json({ id: orderId, number: orderNumber(orderId), status: 'new', total });
});

// --- Mijozning buyurtmalari ro'yxati
router.get('/orders', requireCustomer, (req, res) => {
  const orders = db.prepare(
    `SELECT o.*, (SELECT COALESCE(SUM(qty),0) FROM order_items WHERE order_id = o.id) AS items_count,
            b.name AS branch_name
     FROM orders o LEFT JOIN branches b ON b.id = o.branch_id
     WHERE o.user_id = ? ORDER BY o.id DESC LIMIT 100`
  ).all(req.customer.uid);
  res.json({ orders });
});

// --- Bitta buyurtma (holat kuzatish)
router.get('/orders/:id', requireCustomer, (req, res) => {
  const order = db.prepare(
    `SELECT o.*, b.name AS branch_name, b.address AS branch_address, b.lat AS branch_lat, b.lng AS branch_lng
     FROM orders o LEFT JOIN branches b ON b.id = o.branch_id
     WHERE o.id = ? AND o.user_id = ?`
  ).get(Number(req.params.id), req.customer.uid);
  if (!order) return res.status(404).json({ error: 'Buyurtma topilmadi' });
  const items = db.prepare('SELECT id, name_snapshot, price_snapshot, qty FROM order_items WHERE order_id = ?').all(order.id);
  res.json({ order, items });
});

module.exports = router;
