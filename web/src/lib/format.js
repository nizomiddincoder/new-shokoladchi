// Formatlash yordamchilari: pul, sana, telefon

// 45000 -> "45 000 so'm" (bo'shliq bilan, kasrsiz)
export function money(n) {
  return `${String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} so'm`;
}

// "2026-11-07 10:30:00" -> "07.11.2026"
export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(String(iso).replace(' ', 'T') + (String(iso).includes('Z') ? '' : 'Z'));
  const p = (x) => String(x).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

// "07.11.2026 13:45"
export function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(String(iso).replace(' ', 'T') + (String(iso).includes('Z') ? '' : 'Z'));
  const p = (x) => String(x).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// +998901234567 -> +998 90 123 45 67
export function formatPhone(p) {
  if (!p || p.length < 12) return p || '';
  return `${p.slice(0, 4)} ${p.slice(4, 6)} ${p.slice(6, 9)} ${p.slice(9, 11)} ${p.slice(11)}`;
}

// Koordinata bo'yicha xarita havolalari
export function gmapsUrl(lat, lng) {
  return `https://maps.google.com/?q=${lat},${lng}`;
}
export function ymapsUrl(lat, lng) {
  return `https://yandex.com/maps/?pt=${lng},${lat}&z=16`;
}
