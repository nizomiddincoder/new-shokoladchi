// Telegram Mini App SDK yordamchilari
export function tg() {
  return window.Telegram && window.Telegram.WebApp;
}

export function initTelegram() {
  const w = tg();
  if (!w) return null;
  try { w.ready(); w.expand(); } catch { /* e'tiborsiz */ }
  return w;
}

export function haptic(type = 'light') {
  try { tg()?.HapticFeedback?.impactOccurred(type); } catch { /* e'tiborsiz */ }
}

// Joriy lokatsiyani so'rash (Telegram API). Kelmadi/yo'q bo'lsa reject.
export function requestLocation() {
  return new Promise((resolve, reject) => {
    const w = tg();
    if (!w || typeof w.requestLocation !== 'function') {
      return reject(new Error('noapi'));
    }
    let settled = false;
    const done = (ok, data) => { if (!settled) { settled = true; ok ? resolve(data) : reject(new Error('denied')); } };
    try {
      w.requestLocation((data) => done(true, data), () => done(false));
      // Xavfsizlik uchun taymout: 30 sekund ichida javob kelmadi
      setTimeout(() => done(false), 30000);
    } catch {
      done(false);
    }
  });
}
