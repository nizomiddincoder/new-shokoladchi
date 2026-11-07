// Admin paneli API'si (web panel uchun)
const path = require('path');
const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const db = require('../db');
const { sign, requireAdmin } = require('../middleware/auth');
const { notifyUser, STATUS_TEXT } = require('../telegram');
const { ORDER_STATUSES, orderNumber, money } = require('../order-utils');

const router = express.Router();

// --- Rasm yuklash (multer): diskka, keyinchalik S3'ga almashtirish oson
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads');
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
    cb(null, `p-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});

// --- Kirish
router.post('/login', (req, res) => {
  const { login, password } = req.body || {};
  const admin = db.prepare('SELECT * FROM admins WHERE login = ?').get(String(login || '').trim());
  if (!admin || !bcrypt.compareSync(String(password || ''), admin.password_hash)) {
    return res.status(401).json({ error: 'Login yoki parol xato' });
  }
  res.json({ token: sign({ type: 'admin', aid: admin.id, role: admin.role }), admin: { login: admin.login, role: admin.role } });
});

// Pastdagi barcha yo'nalishlar himoyalangan
router.use(requireAdmin);

// --- Statistika / hisobotlar
function parseRange(q) {
  const now = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  let { from, to } = q;
  if (q.period === 'today') { from = to = iso(now); }
  else if (q.period === 'week') { const s = new Date(now); s.setDate(now.getDate() - 6); from = iso(s); to = iso(now); }
  else if (q.period === 'month') { const s = new Date(now); s.setMonth(now.getMonth() - 1); from = iso(s); to = iso(now); }
  if (!from || !to) { from = iso(now); to = iso(now); }
  return { from, to };
}

router.get('/stats', (req, res) => {
  const { from, to } = parseRange(req.query);
  const notCancelled = "status != 'cancelled'";
  const totals = db.prepare(
    `SELECT COUNT(*) AS orders_count, COALESCE(SUM(total),0) AS revenue
     FROM orders WHERE ${notCancelled} AND date(created_at) BETWEEN ? AND ?`
  ).get(from, to);

  const newCustomers = db.prepare(
    `SELECT COUNT(*) AS c FROM users WHERE date(created_at) BETWEEN ? AND ?`
  ).get(from, to).c;

  const topProducts = db.prepare(
    `SELECT oi.name_snapshot AS name, SUM(oi.qty) AS qty, SUM(oi.qty * oi.price_snapshot) AS revenue
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE o.${notCancelled} AND date(o.created_at) BETWEEN ? AND ?
     GROUP BY oi.name_snapshot ORDER BY qty DESC LIMIT 10`
  ).all(from, to);

  const categoryRevenue = db.prepare(
    `SELECT COALESCE(c.name, 'Boshqa') AS name, SUM(oi.qty * oi.price_snapshot) AS revenue
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     LEFT JOIN products p ON p.id = oi.product_id
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE o.${notCancelled} AND date(o.created_at) BETWEEN ? AND ?
     GROUP BY c.id ORDER BY revenue DESC`
  ).all(from, to);

  const deliverySplit = db.prepare(
    `SELECT delivery_type, COUNT(*) AS c FROM orders
     WHERE ${notCancelled} AND date(created_at) BETWEEN ? AND ? GROUP BY delivery_type`
  ).all(from, to);

  res.json({
    from, to,
    orders_count: totals.orders_count,
    revenue: totals.revenue,
    avg_check: totals.orders_count ? Math.round(totals.revenue / totals.orders_count) : 0,
    new_customers: newCustomers,
    top_products: topProducts,
    category_revenue: categoryRevenue,
    delivery_split: Object.fromEntries(deliverySplit.map((r) => [r.delivery_type, r.c])),
  });
});

// --- Buyurtmalarni CSV'ga eksport qilish (Excel uchun BOM + ';' ajratgich)
router.get('/export/orders.csv', (req, res) => {
  const { from, to } = parseRange(req.query);
  const rows = db.prepare(
    `SELECT o.id, o.created_at, o.status, o.delivery_type, o.total,
            u.name AS user_name, u.phone, b.name AS branch_name, o.address_note, o.lat, o.lng
     FROM orders o JOIN users u ON u.id = o.user_id LEFT JOIN branches b ON b.id = o.branch_id
     WHERE date(o.created_at) BETWEEN ? AND ? ORDER BY o.id`
  ).all(from, to);
  const itemsByOrder = {};
  for (const it of db.prepare(
    `SELECT oi.order_id, oi.name_snapshot, oi.qty FROM order_items oi
     JOIN orders o ON o.id = oi.order_id WHERE date(o.created_at) BETWEEN ? AND ?`
  ).all(from, to)) {
    (itemsByOrder[it.order_id] ||= []).push(`${it.qty}x ${it.name_snapshot}`);
  }
  const statusLabel = { new: 'Yangi', preparing: 'Tayyorlanmoqda', delivering: 'Yetkazilmoqda', completed: 'Yakunlangan', cancelled: 'Bekor qilingan' };
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['ID', 'Sana', 'Mijoz', 'Telefon', 'Tur', 'Holat', 'Manzil/Filial', 'Mahsulotlar', 'Jami'].join(';');
  const lines = rows.map((r) => [
    orderNumber(r.id), r.created_at, r.user_name, r.phone,
    r.delivery_type === 'pickup' ? 'Olib ketish' : 'Yetkazib berish',
    statusLabel[r.status] || r.status,
    r.delivery_type === 'pickup' ? (r.branch_name || '') : (r.lat ? `${r.lat},${r.lng} ${r.address_note || ''}` : (r.address_note || '')),
    (itemsByOrder[r.id] || []).join(', '),
    r.total,
  ].map(esc).join(';'));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="buyurtmalar-${from}_${to}.csv"`);
  res.send('\ufeff' + [header, ...lines].join('\r\n'));
});

// --- Buyurtmalar
router.get('/orders', (req, res) => {
  const { status, delivery, from, to } = req.query;
  const cond = []; const params = [];
  if (status && ORDER_STATUSES.includes(status)) { cond.push('o.status = ?'); params.push(status); }
  if (delivery && ['pickup', 'delivery'].includes(delivery)) { cond.push('o.delivery_type = ?'); params.push(delivery); }
  if (from) { cond.push('date(o.created_at) >= ?'); params.push(from); }
  if (to) { cond.push('date(o.created_at) <= ?'); params.push(to); }
  const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
  const orders = db.prepare(
    `SELECT o.*, u.name AS user_name, u.phone AS user_phone,
            b.name AS branch_name,
            (SELECT COALESCE(SUM(qty),0) FROM order_items WHERE order_id = o.id) AS items_count
     FROM orders o JOIN users u ON u.id = o.user_id LEFT JOIN branches b ON b.id = o.branch_id
     ${where} ORDER BY o.id DESC LIMIT 500`
  ).all(...params);
  res.json({ orders });
});

router.get('/orders/:id', (req, res) => {
  const order = db.prepare(
    `SELECT o.*, u.name AS user_name, u.phone AS user_phone, u.telegram_id,
            b.name AS branch_name, b.address AS branch_address, b.phone AS branch_phone
     FROM orders o JOIN users u ON u.id = o.user_id LEFT JOIN branches b ON b.id = o.branch_id
     WHERE o.id = ?`
  ).get(Number(req.params.id));
  if (!order) return res.status(404).json({ error: 'Buyurtma topilmadi' });
  const items = db.prepare('SELECT id, name_snapshot, price_snapshot, qty FROM order_items WHERE order_id = ?').all(order.id);
  res.json({ order, items });
});

// Holatni o'zgartirish + yetkazib berish narxini kiritish
router.patch('/orders/:id', (req, res) => {
  const order = db.prepare('SELECT o.*, u.telegram_id FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = ?')
    .get(Number(req.params.id));
  if (!order) return res.status(404).json({ error: 'Buyurtma topilmadi' });

  const { status, delivery_price } = req.body || {};

  if (status !== undefined) {
    if (!ORDER_STATUSES.includes(status)) return res.status(400).json({ error: 'Noto‘g‘ri holat' });
    if (status !== order.status) {
      db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, order.id);
      // Bekor qilinganda qoldiqni qaytarib beramiz
      if (status === 'cancelled' && order.status !== 'cancelled') {
        const restore = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ? AND stock IS NOT NULL');
        for (const it of db.prepare('SELECT product_id, qty FROM order_items WHERE order_id = ?').all(order.id)) {
          restore.run(it.qty, it.product_id);
        }
      }
      notifyUser(order.telegram_id, `${STATUS_TEXT[status]}\nBuyurtma: ${orderNumber(order.id)} — ${money(order.total)}`);
    }
  }

  if (delivery_price !== undefined) {
    const dp = Math.max(0, parseInt(delivery_price, 10) || 0);
    const base = db.prepare(
      'SELECT COALESCE(SUM(qty * price_snapshot),0) AS s FROM order_items WHERE order_id = ?'
    ).get(order.id).s;
    db.prepare('UPDATE orders SET delivery_price = ?, total = ? WHERE id = ?').run(dp, base + dp, order.id);
  }

  const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
  res.json({ order: updated });
});

// --- Kategoriyalar
router.get('/categories', (req, res) => {
  res.json({ categories: db.prepare('SELECT * FROM categories ORDER BY sort_order, id').all() });
});

router.post('/categories', (req, res) => {
  const { name, sort_order: sortOrder } = req.body || {};
  const n = String(name || '').trim();
  if (!n) return res.status(400).json({ error: 'Nom kiriting' });
  const info = db.prepare('INSERT INTO categories (name, sort_order) VALUES (?, ?)').run(n, parseInt(sortOrder, 10) || 0);
  res.json({ category: db.prepare('SELECT * FROM categories WHERE id = ?').get(info.lastInsertRowid) });
});

router.put('/categories/:id', (req, res) => {
  const { name, sort_order: sortOrder, is_active: isActive } = req.body || {};
  const n = String(name || '').trim();
  if (!n) return res.status(400).json({ error: 'Nom kiriting' });
  db.prepare('UPDATE categories SET name = ?, sort_order = ?, is_active = COALESCE(?, is_active) WHERE id = ?')
    .run(n, parseInt(sortOrder, 10) || 0, isActive === undefined ? null : (isActive ? 1 : 0), Number(req.params.id));
  res.json({ category: db.prepare('SELECT * FROM categories WHERE id = ?').get(Number(req.params.id)) });
});

router.delete('/categories/:id', (req, res) => {
  const used = db.prepare('SELECT COUNT(*) AS c FROM products WHERE category_id = ?').get(Number(req.params.id)).c;
  if (used > 0) return res.status(400).json({ error: 'Bu kategoriyada mahsulotlar bor, o‘chirib bo‘lmaydi' });
  db.prepare('DELETE FROM categories WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// --- Rasm yuklash
router.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Rasm yuborilmadi' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// --- Mahsulotlar
router.get('/products', (req, res) => {
  const products = db.prepare(
    `SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id
     ORDER BY p.id DESC`
  ).all();
  res.json({ products });
});

function productFields(body) {
  const name = String(body.name || '').trim();
  const price = parseInt(body.price, 10);
  if (!name) return { error: 'Nom kiriting' };
  if (!Number.isFinite(price) || price < 0) return { error: 'Narxni to‘g‘ri kiriting' };
  const stock = body.stock === '' || body.stock === null || body.stock === undefined ? null : parseInt(body.stock, 10);
  return {
    name,
    category_id: Number(body.category_id),
    description: String(body.description || ''),
    price,
    image_url: String(body.image_url || ''),
    stock: stock === null || Number.isNaN(stock) ? null : Math.max(0, stock),
    min_level: Math.max(0, parseInt(body.min_level, 10) || 0),
    is_active: body.is_active === undefined ? 1 : (body.is_active ? 1 : 0),
  };
}

router.post('/products', (req, res) => {
  const f = productFields(req.body || {});
  if (f.error) return res.status(400).json({ error: f.error });
  const info = db.prepare(
    'INSERT INTO products (category_id, name, description, price, image_url, stock, min_level, is_active) VALUES (?,?,?,?,?,?,?,?)'
  ).run(f.category_id, f.name, f.description, f.price, f.image_url, f.stock, f.min_level, f.is_active);
  res.json({ product: db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid) });
});

router.put('/products/:id', (req, res) => {
  const f = productFields(req.body || {});
  if (f.error) return res.status(400).json({ error: f.error });
  db.prepare(
    'UPDATE products SET category_id=?, name=?, description=?, price=?, image_url=?, stock=?, min_level=?, is_active=? WHERE id=?'
  ).run(f.category_id, f.name, f.description, f.price, f.image_url, f.stock, f.min_level, f.is_active, Number(req.params.id));
  res.json({ product: db.prepare('SELECT * FROM products WHERE id = ?').get(Number(req.params.id)) });
});

// O'chirish o'rniga "faol emas" qilamiz (tarix buzilmasligi uchun)
router.delete('/products/:id', (req, res) => {
  db.prepare('UPDATE products SET is_active = 0 WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// --- Filiallar
router.get('/branches', (req, res) => {
  res.json({ branches: db.prepare('SELECT * FROM branches ORDER BY id').all() });
});

router.post('/branches', (req, res) => {
  const { name, address, lat, lng, phone } = req.body || {};
  if (!String(name || '').trim()) return res.status(400).json({ error: 'Nom kiriting' });
  const info = db.prepare('INSERT INTO branches (name, address, lat, lng, phone) VALUES (?,?,?,?,?)')
    .run(String(name).trim(), String(address || ''), lat ? Number(lat) : null, lng ? Number(lng) : null, String(phone || ''));
  res.json({ branch: db.prepare('SELECT * FROM branches WHERE id = ?').get(info.lastInsertRowid) });
});

router.put('/branches/:id', (req, res) => {
  const { name, address, lat, lng, phone } = req.body || {};
  if (!String(name || '').trim()) return res.status(400).json({ error: 'Nom kiriting' });
  db.prepare('UPDATE branches SET name=?, address=?, lat=?, lng=?, phone=? WHERE id=?')
    .run(String(name).trim(), String(address || ''), lat ? Number(lat) : null, lng ? Number(lng) : null, String(phone || ''), Number(req.params.id));
  res.json({ branch: db.prepare('SELECT * FROM branches WHERE id = ?').get(Number(req.params.id)) });
});

router.delete('/branches/:id', (req, res) => {
  const used = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE branch_id = ?").get(Number(req.params.id)).c;
  if (used > 0) return res.status(400).json({ error: 'Bu filialga buyurtmalar bog‘langan, o‘chirib bo‘lmaydi' });
  db.prepare('DELETE FROM branches WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// --- Mijozlar (faqat ko'rish)
router.get('/customers', (req, res) => {
  const customers = db.prepare(
    `SELECT u.*, COUNT(o.id) AS orders_count, COALESCE(SUM(o.total),0) AS spent
     FROM users u LEFT JOIN orders o ON o.user_id = u.id AND o.status != 'cancelled'
     GROUP BY u.id ORDER BY u.id DESC LIMIT 1000`
  ).all();
  res.json({ customers });
});

// --- Ombor: qoldiqlar va harakatlar
router.get('/stock', (req, res) => {
  const products = db.prepare(
    `SELECT p.id, p.name, p.price, p.stock, p.min_level, p.is_active, c.name AS category_name
     FROM products p LEFT JOIN categories c ON c.id = p.category_id ORDER BY p.name`
  ).all();
  res.json({ products });
});

router.post('/stock/:id/movement', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(Number(req.params.id));
  if (!product) return res.status(404).json({ error: 'Mahsulot topilmadi' });
  const delta = parseInt(req.body?.delta, 10);
  if (!Number.isFinite(delta) || delta === 0) return res.status(400).json({ error: 'Miqdorni kiriting (+ kirim, - chiqim)' });
  const newStock = (product.stock ?? 0) + delta;
  if (newStock < 0) return res.status(400).json({ error: 'Qoldiq manfiy bo‘lib qolmaydi' });
  db.transaction(() => {
    db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(newStock, product.id);
    db.prepare('INSERT INTO stock_movements (product_id, delta, reason) VALUES (?,?,?)')
      .run(product.id, delta, String(req.body?.reason || '').slice(0, 200));
  })();
  res.json({ stock: newStock });
});

router.get('/stock/movements', (req, res) => {
  const movements = db.prepare(
    `SELECT m.*, p.name AS product_name FROM stock_movements m
     JOIN products p ON p.id = m.product_id ORDER BY m.id DESC LIMIT 50`
  ).all();
  res.json({ movements });
});

module.exports = router;
