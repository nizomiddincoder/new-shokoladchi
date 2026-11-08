// Test initData yasash (rasmiy Telegram algoritmi): scripts\gen-initdata.js
const crypto = require('crypto');
const path = require('path');

const botToken = process.env.TEST_BOT_TOKEN || '7000000001:AAFakeTokenForLocalTest123456789';
const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();

const params = new URLSearchParams({
  auth_date: String(Math.floor(Date.now() / 1000)),
  query_id: 'AAF_test',
  user: JSON.stringify({ id: 777, first_name: 'Test', username: 'testuser' }),
});
const dataCheckString = [...params.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([k, v]) => `${k}=${v}`)
  .join('\n');
params.set('hash', crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex'));

const out = path.join(process.env.TEMP, 'initdata.txt');
require('fs').writeFileSync(out, params.toString());
console.log('initData yozildi: ' + out);
