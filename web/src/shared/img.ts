import { useState } from 'react';

/**
 * Rasm yuklanmasa (serverda yo'q / internet sekin) — buzilgan rasm ikonkasi o'rniga
 * zaxira ko'rinish chiqarish uchun. `ok` false bo'lsa komponent ikonka ko'rsatadi.
 */
export function useImageOk(url: string | null | undefined) {
  const [broken, setBroken] = useState<string | null>(null);
  return { ok: !!url && broken !== url, onError: () => setBroken(url ?? null) };
}
