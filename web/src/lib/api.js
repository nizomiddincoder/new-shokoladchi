// API klienti: barcha so'rovlar shu orqali ketadi
export const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

// Rasm havolasini to'liq URL'ga aylantirish
export function imgUrl(u) {
  if (!u) return '';
  return u.startsWith('http') ? u : API_URL + u;
}

export async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(API_URL + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Xatolik yuz berdi');
  return data;
}

// Fayl yuklash (rasm) — multipart
export async function uploadImage(file, token) {
  const fd = new FormData();
  fd.append('image', file);
  const res = await fetch(API_URL + '/api/admin/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Rasm yuklanmadi');
  return data.url;
}

// CSV yuklab olish (admin hisobot)
export async function downloadCsv(path, token, filename) {
  const res = await fetch(API_URL + path, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('Yuklab olishda xatolik');
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
