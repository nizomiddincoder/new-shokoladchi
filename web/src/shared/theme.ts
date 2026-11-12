import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const KEY = 'theme';
const EVENT = 'theme-change';
// Telegram sarlavha/fon ranglari (styles.css dagi --c-bg bilan bir xil)
const TG_COLORS: Record<Theme, string> = { light: '#FFFFFF', dark: '#160F0B' };

export function getTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** Mavzuni sahifaga va Telegram oynasiga qo'llaydi */
export function applyTheme(theme: Theme = getTheme()) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', TG_COLORS[theme]);
  const tg = (window as unknown as { Telegram?: { WebApp?: any } }).Telegram?.WebApp;
  if (tg?.initData) {
    try {
      if (tg.isVersionAtLeast?.('6.1')) {
        tg.setHeaderColor(TG_COLORS[theme]);
        tg.setBackgroundColor(TG_COLORS[theme]);
      }
      if (tg.isVersionAtLeast?.('7.10')) tg.setBottomBarColor?.(TG_COLORS[theme]);
    } catch {
      /* eski versiyalar */
    }
  }
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* noop */
  }
  applyTheme(theme);
  window.dispatchEvent(new Event(EVENT));
}

export function useTheme() {
  const [theme, set] = useState<Theme>(getTheme);
  useEffect(() => {
    const on = () => set(getTheme());
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return { theme, setTheme, toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark') };
}
