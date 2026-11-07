// Umumiy yordamchilar: buyurtma raqami, summa formati, holatlar
const { escapeHtml } = require('./telegram');
const db = require('./db');

const ORDER_STATUSES = ['new', 'preparing', 'delivering', 'completed', 'cancelled'];
const DELIVERY_LABEL = { pickup: 'Olib ketish', delivery: 'Yetkazib berish' };

// Buyurtma raqami: ichki id + 1000 (chiroyli ko'rinish uchun)
const orderNumber = (id) => `#${1000 + id}`;

const money = (n) => `${String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} so'm`;

// Adminga yuboriladigan yangi buyurtma matni
function newOrderText(orderId, { user, lines, total, deliveryType, branch, lat, lng, addressNote }) {
  const items = lines.map((l, i) => `${i + 1}) ${escapeHtml(l.name_snapshot)} ×${l.qty} — ${money(l.price_snapshot * l.qty)}`).join('\n');

  let place;
  if (deliveryType === 'pickup') {
    place = `Filial: ${escapeHtml(branch ? branch.name : '-')}\nManzil: ${escapeHtml(branch ? branch.address : '-')}`;
  } else {
    const coords = lat && lng ? `https://maps.google.com/?q=${lat},${lng}` : 'koordinata yuborilmagan';
    place = `Lokatsiya: ${coords}\nIzoh: ${escapeHtml(addressNote || '-')}`;
  }

  return [
    `🆕 <b>Yangi buyurtma ${orderNumber(orderId)}</b>`,
    '',
    `Mijoz: <b>${escapeHtml(user.name)}</b> (${escapeHtml(user.phone || 'telefon yo‘q')})`,
    `Tur: ${DELIVERY_LABEL[deliveryType]}`,
    place,
    '',
    items,
    '',
    `Jami: <b>${money(total)}</b>`,
  ].join('\n');
}

module.exports = { ORDER_STATUSES, DELIVERY_LABEL, orderNumber, money, newOrderText, escapeHtml, db };
