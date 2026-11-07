// Telegram bot (grammY, long polling) va bildirishnomalar
const { Bot } = require('grammy');
const db = require('./db');

let bot = null;

// Buyurtma holatlarining o'zbekcha matnlari (mijozga yuboriladi)
const STATUS_TEXT = {
  new: 'Yangi buyurtmangiz qabul qilindi ✅',
  preparing: 'Buyurtmangiz tayyorlanmoqda 👨‍🍳',
  delivering: 'Buyurtma yetkazib berilmoqda 🚚',
  completed: 'Buyurtma yakunlandi. Rahmat! 🍫',
  cancelled: 'Buyurtmangiz bekor qilindi ❌',
};

function escapeHtml(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function initBot(webAppUrl) {
  if (!process.env.BOT_TOKEN) {
    console.warn("BOT_TOKEN sozlanmagan — bot ishga tushmadi (faqat API ishlaydi)");
    return;
  }
  bot = new Bot(process.env.BOT_TOKEN);

  // /start — Mini App tugmasi bilan salomlashish
  bot.command('start', (ctx) => {
    const rows = [[{ text: '🍫 Buyurtma berish', web_app: { url: webAppUrl } }]];
    return ctx.reply('Shokoladchi botiga xush kelibsiz!\nBuyurtma berish uchun pastdagi tugmani bosing.', {
      reply_markup: { inline_keyboard: rows },
    });
  });

  // Mijoz Mini App'da "Raqamni ulashish"ni bosganda kontakt shu yerda keladi
  bot.on('message:contact', async (ctx) => {
    const c = ctx.message.contact;
    if (!c || !c.user_id) return;
    const phone = c.phone_number.startsWith('+') ? c.phone_number : '+' + c.phone_number;
    db.prepare(
      `INSERT INTO contact_shares (telegram_id, phone, created_at) VALUES (?,?,datetime('now'))
       ON CONFLICT(telegram_id) DO UPDATE SET phone=excluded.phone, created_at=excluded.created_at`
    ).run(String(c.user_id), phone);
    await ctx.reply('Rahmat! Raqamingiz saqlandi ✅');
  });

  // Long polling: bot xabarlarni shu jarayon ichida oladi
  bot.start().catch((e) => console.error('Bot ishga tushmadi:', e.message));
}

// Adminga yangi buyurtma haqida xabar
function notifyAdmin(text) {
  const chatId = process.env.ADMIN_CHAT_ID;
  if (!bot || !chatId) return;
  bot.api.sendMessage(chatId, text, { parse_mode: 'HTML' }).catch((e) => {
    console.error('Adminga xabar yuborilmadi:', e.message);
  });
}

// Mijozga buyurtma holati o'zgargani haqida xabar
function notifyUser(telegramId, text) {
  if (!bot || !telegramId) return;
  bot.api.sendMessage(String(telegramId), text, { parse_mode: 'HTML' }).catch((e) => {
    console.error('Mijozga xabar yuborilmadi:', e.message);
  });
}

module.exports = { initBot, notifyAdmin, notifyUser, STATUS_TEXT, escapeHtml };
