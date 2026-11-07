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

// Markaziy xato ushlagich
app.use((err, req, res, next) => {
  console.error('Server xatosi:', err.message);
  if (!res.headersSent) res.status(500).json({ error: 'Server xatosi' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Shokoladchi API ${PORT} portda ishlayapti`));

// Botni ishga tushirish (BOT_TOKEN bo'lsa)
require('./telegram').initBot(process.env.WEB_APP_URL || '');
