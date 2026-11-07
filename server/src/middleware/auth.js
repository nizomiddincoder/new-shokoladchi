// JWT yordamchi middleware'lar: mijoz va admin uchun alohida himoya
const jwt = require('jsonwebtoken');

const secret = () => process.env.JWT_SECRET || 'dev-secret-ozgartiring';

function sign(payload) {
  return jwt.sign(payload, secret(), { expiresIn: '30d' });
}

function readToken(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

// Mini App mijozini tekshirish
function requireCustomer(req, res, next) {
  try {
    const payload = jwt.verify(readToken(req) || '', secret());
    if (payload.type !== 'customer') throw new Error('tur');
    req.customer = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Avtorizatsiya talab qilinadi' });
  }
}

// Admin paneldagi so'rovlarni tekshirish
function requireAdmin(req, res, next) {
  try {
    const payload = jwt.verify(readToken(req) || '', secret());
    if (payload.type !== 'admin') throw new Error('tur');
    req.admin = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Avtorizatsiya talab qilinadi' });
  }
}

module.exports = { sign, requireCustomer, requireAdmin };
