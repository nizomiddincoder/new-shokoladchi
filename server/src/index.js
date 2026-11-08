// Serverning asosiy kirish nuqtasi
require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Yuklangan rasmlarni statik tarzda berish
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
require('fs').mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir));

// API yo'nalishlari
app.use('/api/customer', require('./routes/customer'));
app.use('/api/admin', require('./routes/admin'));

// Sog'liq tekshiruvi (Railway monitoring uchun)
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Veb-ilova (web/dist) — API bilan bir domaindan beriladi: /admin va / to'liq sayt
// (dist build'da yaratiladi; yo'q bo'lsa — faqat API rejimi, masalan Root Directory=server bilan)
const distDir = path.join(__dirname, '..', '..', 'web', 'dist');
if (require('fs').existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^\/(?!api|uploads).*/, (req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

// Markaziy xato ushlagich
app.use((err, req, res, next) => {
  console.error('Server xatosi:', err.message);
  if (!res.headersSent) res.status(500).json({ error: 'Server xatosi' });
});

// Boshlang'ich ma'lumotlar: admin yo'q bo'lsa yaratamiz (yangi deploy yoki volume uchun),
// demo katalog SEED_DEMO=false bo'lmasa qo'shiladi
require('./seed').seed({ withDemo: process.env.SEED_DEMO !== 'false' });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Shokoladchi API ${PORT} portda ishlayapti`));

// Botni ishga tushirish (BOT_TOKEN bo'lsa)
require('./telegram').initBot(process.env.WEB_APP_URL || '');
