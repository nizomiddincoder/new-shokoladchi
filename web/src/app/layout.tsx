import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { ChevronLeft, type LucideIcon } from 'lucide-react';
import { ThemeToggle, clsx } from '../shared/ui';
import { haptic, isTelegram, useBackButton } from '../shared/telegram';

export type NavItem = { to: string; icon: LucideIcon; label: string; badge?: number; end?: boolean };

export function BottomNav({ items }: { items: NavItem[] }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 backdrop-blur" style={{ paddingBottom: 'var(--safe-bottom)' }}>
      <div className="mx-auto flex max-w-xl">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            onClick={() => haptic('select')}
            className={({ isActive }) => clsx('relative flex flex-1 flex-col items-center gap-0.5 pb-2 pt-2.5 text-[11px] font-semibold transition', isActive ? 'text-primary' : 'text-muted')}
          >
            {({ isActive }) => (
              <>
                <span className="relative">
                  <it.icon className="h-[22px] w-[22px]" strokeWidth={isActive ? 2.4 : 1.9} />
                  {!!it.badge && (
                    <span className="absolute -right-2.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                      {it.badge > 99 ? '99+' : it.badge}
                    </span>
                  )}
                </span>
                {it.label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

/** Asosiy (tab) sahifa konteyneri */
export function Screen({ children, className, withNav = true }: { children: ReactNode; className?: string; withNav?: boolean }) {
  return (
    <div className={clsx('fade-in mx-auto min-h-screen max-w-xl', className)} style={{ paddingBottom: withNav ? 'calc(var(--safe-bottom) + 84px)' : 'calc(var(--safe-bottom) + 24px)' }}>
      {children}
    </div>
  );
}

/** Ichki sahifa sarlavhasi: Telegram'da BackButton ishlatiladi */
export function PageHeader({ title, right, back = true }: { title: ReactNode; right?: ReactNode; back?: boolean }) {
  const navigate = useNavigate();
  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate('/'));
  useBackButton(back ? goBack : null);
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line/60 bg-card/95 px-3 backdrop-blur">
      {back && !isTelegram && (
        <button onClick={goBack} className="-ml-1 flex h-10 w-10 items-center justify-center rounded-full hover:bg-primary-soft" aria-label="back">
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      <h1 className="min-w-0 flex-1 truncate px-1 font-display text-[19px] font-bold text-ink">{title}</h1>
      {right}
    </header>
  );
}

export function TopTitle({ title, right }: { title: ReactNode; right?: ReactNode }) {
  useBackButton(null);
  return (
    <header className="flex items-center justify-between gap-2 px-4 pb-2 pt-4">
      <h1 className="min-w-0 truncate font-display text-[26px] font-bold text-ink">{title}</h1>
      <div className="flex shrink-0 items-center gap-2">
        {right}
        <ThemeToggle />
      </div>
    </header>
  );
}
