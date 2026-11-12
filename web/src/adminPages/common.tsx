import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Tabs } from '../shared/ui';
import { isTelegram, useBackButton } from '../shared/telegram';
import { todayISO } from '../shared/format';

export type AdminEnv = { isWeb: boolean; meId?: number | null };
export const AdminCtx = createContext<AdminEnv>({ isWeb: true });
export const useAdminEnv = () => useContext(AdminCtx);

export function useIsMobile() {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const on = () => setM(window.innerWidth < 768);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return m;
}

/** Admin sahifasi: web'da sarlavha qatori, mini app'da sticky header + BackButton */
export function AdminPage({ title, actions, children, root }: { title: ReactNode; actions?: ReactNode; children: ReactNode; root?: boolean }) {
  const { isWeb } = useAdminEnv();
  const navigate = useNavigate();
  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate('/'));
  useBackButton(!isWeb && !root ? goBack : null);
  if (isWeb) {
    return (
      <div className="fade-in">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {!root && (
              <button onClick={goBack} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-primary-soft" aria-label="back">
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            <h1 className="text-[24px] font-extrabold tracking-tight text-ink">{title}</h1>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {children}
      </div>
    );
  }
  return (
    <div className="fade-in mx-auto max-w-xl" style={{ paddingBottom: 'calc(var(--safe-bottom) + 90px)' }}>
      <header className="sticky top-0 z-30 flex min-h-14 items-center gap-2 border-b border-line/60 bg-white/95 px-3 py-2 backdrop-blur">
        {!root && !isTelegram && (
          <button onClick={goBack} className="-ml-1 flex h-10 w-10 items-center justify-center rounded-full hover:bg-primary-soft" aria-label="back">
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        <h1 className="min-w-0 flex-1 truncate px-1 text-[17px] font-bold">{title}</h1>
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </header>
      <div className="px-4 pt-3">{children}</div>
    </div>
  );
}

export type RangeValue = { preset: 'today' | '7d' | '30d' | 'custom'; from: string; to: string };

export function RangePicker({ value, onChange }: { value: RangeValue; onChange: (v: RangeValue) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Tabs
        value={value.preset}
        onChange={(preset) => onChange({ ...value, preset, from: value.from || todayISO(), to: value.to || todayISO() })}
        items={[
          { value: 'today', label: t('common.today') },
          { value: '7d', label: t('common.days7') },
          { value: '30d', label: t('common.days30') },
          { value: 'custom', label: t('common.custom') },
        ]}
      />
      {value.preset === 'custom' && (
        <div className="flex items-center gap-2">
          <input type="date" className="input h-9 w-auto py-1 text-[13px]" value={value.from} max={value.to} onChange={(e) => onChange({ ...value, from: e.target.value })} />
          <span className="text-muted">—</span>
          <input type="date" className="input h-9 w-auto py-1 text-[13px]" value={value.to} min={value.from} onChange={(e) => onChange({ ...value, to: e.target.value })} />
        </div>
      )}
    </div>
  );
}

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto rounded-2xl bg-white shadow-card">{children}</div>;
}
