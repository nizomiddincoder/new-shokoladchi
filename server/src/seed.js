// Demo ma'lumotlar: admin, kategoriyalar, mahsulotlar, filiallar
// Ishga tushirish: npm run seed
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./db');

// 1) Admin (faqat bo'sh bo'lsa)
if (db.prepare('SELECT COUNT(*) AS c FROM admins').get().c === 0) {
  const login = process.env.ADMIN_LOGIN || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  db.prepare('INSERT INTO admins (login, password_hash) VALUES (?, ?)')
    .run(login, bcrypt.hashSync(password, 10));
  console.log(`Admin yaratildi: ${login} / ${password}`);
}

// 2) Kategoriyalar va mahsulotlar (faqat bo'sh bo'lsa)
if (db.prepare('SELECT COUNT(*) AS c FROM categories').get().c === 0) {
  const cats = ['Shokolad plitalari', 'Konfetlar', 'Truffellar', 'Karamel va zefir'];
  const insCat = db.prepare('INSERT INTO categories (name, sort_order) VALUES (?, ?)');
  const catIds = cats.map((name, i) => insCat.run(name, i).lastInsertRowid);

  const insProd = db.prepare(
    'INSERT INTO products (category_id, name, description, price, stock, min_level) VALUES (?,?,?,?,?,?)'
  );
  const products = [
    [catIds[0], 'Sutli shokolad 90g', 'Iste\'molga tayyor klassik sutli shokolad', 28000, 40, 10],
    [catIds[0], "Qora shokolad 70% 90g", "Tabiiy kakao 70% — achchiq ta'm", 34000, 25, 5],
    [catIds[0], 'Andozali shokolad 90g', 'Yong\'oq va shokolad uyg\'unligi', 36000, 18, 5],
    [catIds[1], 'Truffle konfetlar (9 dona)', 'Qo\'lda tayyorlangan truffellar to\'plami', 62000, 12, 4],
    [catIds[1], 'Karamel konfetlar (500g)', 'Sutli karamel, mevali nashirlar bilan', 45000, 30, 10],
    [catIds[2], 'Praline truffel qutisi', 'Bayram uchun savisit quti', 120000, 8, 3],
    [catIds[3], 'Zefir vanil 300g', 'Yumshoq vanil zefir', 24000, 22, 6],
    [catIds[3], 'Qizilqum karameli 400g', 'An\'anaviy shirinlik', 30000, 0, 5],
  ];
  for (const p of products) insProd.run(...p);
  console.log(`${products.length} ta demo mahsulot qo'shildi`);
}

// 3) Filiallar (faqat bo'sh bo'lsa)
if (db.prepare('SELECT COUNT(*) AS c FROM branches').get().c === 0) {
  const insBranch = db.prepare('INSERT INTO branches (name, address, lat, lng, phone) VALUES (?,?,?,?,?)');
  insBranch.run('Markaz filial', 'Toshkent, Amir Temur shoh ko\'chasi 108', 41.3111, 69.2797, '+998901112233');
  insBranch.run('Chilonzor filial', 'Toshkent, Chilonzor 11-kvartal', 41.2747, 69.2041, '+998901112244');
  insBranch.run('Yunusobod filial', 'Toshkent, Yunusobod 4-mavze', 41.3697, 69.2897, '+998901112255');
  console.log('3 ta demo filial qo\'shildi');
}

console.log('Seed yakunlandi ✅');
