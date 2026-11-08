// Telegram Mini App initData imzosini tekshirish (majburiy xavfsizlik qadami)
// Rasmiy algoritm: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
const crypto = require('crypto');

function verifyInitData(initData, botToken, maxAgeSec = 86400) {
  if (!initData) return { ok: false, reason: 'no_initdata' };
  if (!botToken) return { ok: false, reason: 'no_token' };

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return { ok: false, reason: 'no_hash' };
  params.delete('hash');

  // signature va hash maydonlari tekshiruv satriga kirmaydi
  params.delete('signature');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculated = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (calculated !== hash) return { ok: false, reason: 'bad_hash' };

  // Eskirgan so'rovlarni rad etamiz (1 kundan ko'p bo'lsa)
  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate || Math.floor(Date.now() / 1000) - authDate > maxAgeSec) {
    return { ok: false, reason: 'expired' };
  }

  return { ok: true, data: Object.fromEntries(params) };
}

module.exports = { verifyInitData };
