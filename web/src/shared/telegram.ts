import { useEffect, useRef } from 'react';

/* eslint-disable @typescript-eslint/no-explicit-any */
type TgWebApp = any;

declare global {
  interface Window {
    Telegram?: { WebApp: TgWebApp };
  }
}

export const tg: TgWebApp | null =
  typeof window !== 'undefined' && window.Telegram?.WebApp?.initData ? window.Telegram.WebApp : null;

export const isTelegram = !!tg;

/** Telegram ichida ochilgan, lekin initData kelmagan (masalan oddiy klaviatura tugmasidan) */
export const insideTelegramWithoutData =
  !tg && typeof window !== 'undefined' && !!window.Telegram?.WebApp && window.Telegram.WebApp.platform !== 'unknown';

export function closeApp() {
  try {
    window.Telegram?.WebApp?.close();
  } catch {
    /* noop */
  }
}

const versionAtLeast = (v: string) => {
  try {
    return !!tg?.isVersionAtLeast?.(v);
  } catch {
    return false;
  }
};

export function initTelegram() {
  if (!tg) return;
  try {
    tg.ready();
    tg.expand();
    if (versionAtLeast('6.1')) {
      tg.setHeaderColor('#FFFFFF');
      tg.setBackgroundColor('#FFFFFF');
    }
    if (versionAtLeast('7.10')) tg.setBottomBarColor?.('#FFFFFF');
    if (versionAtLeast('7.7')) tg.disableVerticalSwipes?.();
  } catch {
    /* eski versiyalar */
  }
}

export function haptic(kind: 'light' | 'medium' | 'success' | 'error' | 'warning' | 'select' = 'light') {
  const h = tg?.HapticFeedback;
  if (!h || !versionAtLeast('6.1')) return;
  try {
    if (kind === 'success' || kind === 'error' || kind === 'warning') h.notificationOccurred(kind);
    else if (kind === 'select') h.selectionChanged();
    else h.impactOccurred(kind);
  } catch {
    /* noop */
  }
}

/** Telegram BackButton: onBack berilsa ko'rinadi */
export function useBackButton(onBack: (() => void) | null) {
  const ref = useRef(onBack);
  ref.current = onBack;
  useEffect(() => {
    const bb = tg?.BackButton;
    if (!bb || !versionAtLeast('6.1')) return;
    if (!onBack) {
      bb.hide();
      return;
    }
    const handler = () => ref.current?.();
    bb.onClick(handler);
    bb.show();
    return () => {
      bb.offClick(handler);
      bb.hide();
    };
  }, [!!onBack]);
}

/** Telegram MainButton (pastki katta tugma) */
export function useMainButton(opts: { text: string; onClick: () => void; visible?: boolean; disabled?: boolean; loading?: boolean }) {
  const ref = useRef(opts.onClick);
  ref.current = opts.onClick;
  const visible = opts.visible !== false;
  useEffect(() => {
    const mb = tg?.MainButton;
    if (!mb) return;
    const handler = () => {
      haptic('medium');
      ref.current();
    };
    mb.onClick(handler);
    return () => {
      mb.offClick(handler);
      mb.hide();
    };
  }, []);
  useEffect(() => {
    const mb = tg?.MainButton;
    if (!mb) return;
    mb.setParams({
      text: opts.text,
      color: opts.disabled ? '#A47551' : '#6F4E37',
      text_color: '#FFFFFF',
      is_active: !opts.disabled,
      is_visible: visible,
    });
    if (opts.loading) mb.showProgress(false);
    else mb.hideProgress();
  }, [opts.text, opts.disabled, opts.loading, visible]);
}

/** Joylashuvni olish: Telegram LocationManager (Bot API 8.0+), bo'lmasa navigator.geolocation */
export function requestLocation(): Promise<{ lat: number; lng: number }> {
  const lm = tg?.LocationManager;
  const viaBrowser = () =>
    new Promise<{ lat: number; lng: number }>((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('NO_GEO'));
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        (e) => reject(new Error(e.code === 1 ? 'DENIED' : 'UNAVAILABLE')),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
      );
    });
  if (!lm || !versionAtLeast('8.0')) return viaBrowser();
  return new Promise((resolve, reject) => {
    const doGet = () => {
      if (!lm.isLocationAvailable) return viaBrowser().then(resolve, reject);
      lm.getLocation((loc: { latitude: number; longitude: number } | null) => {
        if (loc) resolve({ lat: loc.latitude, lng: loc.longitude });
        else if (!lm.isAccessGranted && lm.isAccessRequested) {
          reject(new Error('DENIED'));
        } else viaBrowser().then(resolve, reject);
      });
    };
    if (lm.isInited) doGet();
    else lm.init(doGet);
  });
}

export function openLocationSettings() {
  try {
    tg?.LocationManager?.openSettings?.();
  } catch {
    /* noop */
  }
}

export function openLink(url: string) {
  if (tg) tg.openLink(url);
  else window.open(url, '_blank', 'noopener');
}

export function openBot() {
  if (tg) tg.close();
}
