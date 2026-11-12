import { createContext, useCallback, useContext, useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';
import { AlertCircle, CheckCircle2, Info, Loader2, Minus, Plus, X, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { haptic } from './telegram';
import { ApiError } from './api';

export { clsx };

// ---------------- Button ----------------
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: LucideIcon;
  block?: boolean;
};

export function Button({ variant = 'primary', size = 'md', loading, icon: Icon, block, className, children, disabled, onClick, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      onClick={(e) => {
        haptic('light');
        onClick?.(e);
      }}
      className={clsx(
        'inline-flex select-none items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55',
        size === 'sm' && 'h-9 px-3 text-[13px]',
        size === 'md' && 'h-11 px-4 text-[14px]',
        size === 'lg' && 'h-[52px] px-5 text-[15px]',
        variant === 'primary' && 'bg-primary text-white hover:bg-primary-dark',
        variant === 'secondary' && 'bg-primary-soft text-primary-dark hover:bg-[#EADFD7]',
        variant === 'outline' && 'border border-line bg-white text-ink hover:bg-surface',
        variant === 'ghost' && 'text-primary hover:bg-primary-soft',
        variant === 'danger' && 'bg-danger text-white hover:opacity-90',
        variant === 'success' && 'bg-success text-white hover:opacity-90',
        block && 'w-full',
        className,
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} /> : null}
      {children}
    </button>
  );
}

export function IconButton({ icon: Icon, className, label, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      {...rest}
      onClick={(e) => {
        haptic('light');
        rest.onClick?.(e);
      }}
      className={clsx('inline-flex h-10 w-10 items-center justify-center rounded-full text-ink transition hover:bg-primary-soft active:scale-95 disabled:opacity-40', className)}
    >
      <Icon className="h-5 w-5" strokeWidth={2} />
    </button>
  );
}

// ---------------- Form ----------------
export function Field({ label, hint, error, children, className }: { label?: string; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={clsx('block', className)}>
      {label && <span className="label">{label}</span>}
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-muted">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-danger">{error}</span>}
    </label>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        haptic('select');
        onChange(!checked);
      }}
      className="flex items-center gap-3 text-left"
    >
      <span className={clsx('relative h-6 w-11 shrink-0 rounded-full transition', checked ? 'bg-primary' : 'bg-line')}>
        <span className={clsx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition', checked ? 'left-[22px]' : 'left-0.5')} />
      </span>
      {label && <span className="text-sm font-medium text-ink">{label}</span>}
    </button>
  );
}

// ---------------- Display ----------------
export function Badge({ tone = 'soft', children, className }: { tone?: 'soft' | 'accent' | 'danger' | 'success' | 'muted' | 'primary' | 'warning' | 'info'; children: ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold',
        tone === 'soft' && 'bg-primary-soft text-primary-dark',
        tone === 'accent' && 'bg-accent text-white',
        tone === 'primary' && 'bg-primary text-white',
        tone === 'danger' && 'bg-[#FBEAE8] text-danger',
        tone === 'success' && 'bg-[#E8F3E9] text-success',
        tone === 'muted' && 'bg-surface text-muted',
        tone === 'warning' && 'bg-[#FCF1E3] text-[#A86A1E]',
        tone === 'info' && 'bg-[#EAF1FB] text-[#2F5E9E]',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton rounded-xl', className)} />;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('h-6 w-6 animate-spin text-primary', className)} />;
}

export function PageLoader() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner />
    </div>
  );
}

export function Empty({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="fade-in flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary-soft">
        <Icon className="h-9 w-9 text-primary" strokeWidth={1.8} />
      </div>
      <h3 className="text-[17px] font-bold text-ink">{title}</h3>
      {text && <p className="mt-1.5 max-w-xs text-sm text-muted">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <Empty
      icon={AlertCircle}
      title={t('common.error')}
      text={error instanceof Error ? error.message : undefined}
      action={onRetry && <Button variant="secondary" onClick={onRetry}>{t('common.retry')}</Button>}
    />
  );
}

export function Card({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={clsx('card', onClick && 'cursor-pointer transition active:scale-[0.99]', className)}>
      {children}
    </div>
  );
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-[17px] font-bold text-ink">{title}</h2>
      {action}
    </div>
  );
}

export function Stat({ label, value, icon: Icon, tone }: { label: string; value: ReactNode; icon?: LucideIcon; tone?: 'danger' }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-[12px] font-semibold text-muted">
        {Icon && <Icon className={clsx('h-4 w-4', tone === 'danger' ? 'text-danger' : 'text-primary-light')} />}
        {label}
      </div>
      <div className={clsx('mt-1.5 text-[20px] font-extrabold tracking-tight', tone === 'danger' ? 'text-danger' : 'text-primary-dark')}>{value}</div>
    </div>
  );
}

// ---------------- Tabs ----------------
export function Tabs<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={clsx('no-scrollbar flex gap-2 overflow-x-auto', className)}>
      {items.map((it) => (
        <button
          key={it.value}
          onClick={() => {
            haptic('select');
            onChange(it.value);
          }}
          className={clsx('chip', value === it.value && 'chip-active')}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode; icon?: LucideIcon }[] }) {
  return (
    <div className="flex rounded-xl bg-primary-soft p-1">
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          onClick={() => {
            haptic('select');
            onChange(it.value);
          }}
          className={clsx(
            'flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-[14px] font-semibold transition',
            value === it.value ? 'bg-white text-primary-dark shadow-card' : 'text-muted',
          )}
        >
          {it.icon && <it.icon className="h-4 w-4" />}
          {it.label}
        </button>
      ))}
    </div>
  );
}

// ---------------- Stepper ----------------
export function Stepper({ value, onChange, step, min, max, size = 'md', suffix }: { value: number; onChange: (v: number) => void; step: number; min: number; max?: number; size?: 'sm' | 'md'; suffix?: string }) {
  const round = (n: number) => Math.round(n * 1000) / 1000;
  const dec = () => onChange(round(value - step < min ? 0 : value - step));
  const inc = () => onChange(round(max != null && value + step > max ? value : value + step));
  const sm = size === 'sm';
  return (
    <div className={clsx('inline-flex items-center rounded-full bg-primary-soft', sm ? 'h-8' : 'h-11')}>
      <button type="button" aria-label="-" onClick={() => { haptic('light'); dec(); }} className={clsx('flex items-center justify-center rounded-full text-primary-dark active:scale-90', sm ? 'h-8 w-8' : 'h-11 w-11')}>
        <Minus className={sm ? 'h-4 w-4' : 'h-5 w-5'} strokeWidth={2.4} />
      </button>
      <span className={clsx('min-w-[2.2rem] text-center font-bold text-primary-dark', sm ? 'text-[13px]' : 'text-[15px]')}>
        {round(value)}
        {suffix && <span className="ml-0.5 text-[11px] font-semibold text-muted">{suffix}</span>}
      </span>
      <button
        type="button"
        aria-label="+"
        disabled={max != null && value + step > max + 1e-9}
        onClick={() => { haptic('light'); inc(); }}
        className={clsx('flex items-center justify-center rounded-full text-primary-dark active:scale-90 disabled:opacity-40', sm ? 'h-8 w-8' : 'h-11 w-11')}
      >
        <Plus className={sm ? 'h-4 w-4' : 'h-5 w-5'} strokeWidth={2.4} />
      </button>
    </div>
  );
}

// ---------------- Modal / Sheet ----------------
export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className={clsx('sheet-in flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-white shadow-lift sm:rounded-3xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h3 className="text-[16px] font-bold text-ink">{title}</h3>
          <IconButton icon={X} label="close" onClick={onClose} className="-mr-2 h-9 w-9" />
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="pb-safe border-t border-line px-5 pt-3">{footer}</div>}
      </div>
    </div>
  );
}

/** Sabab so'raydigan modal (bekor qilish uchun) */
export function ReasonModal({ open, onClose, onSubmit, title, loading }: { open: boolean; onClose: () => void; onSubmit: (reason: string) => void; title: string; loading?: boolean }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (open) setReason('');
  }, [open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex gap-2 pb-2">
          <Button variant="outline" block onClick={onClose}>{t('common.close')}</Button>
          <Button variant="danger" block loading={loading} disabled={reason.trim().length < 2} onClick={() => onSubmit(reason.trim())}>
            {t('common.confirm')}
          </Button>
        </div>
      }
    >
      <Field label={t('common.reason')}>
        <textarea className="input min-h-[96px]" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('common.reasonPlaceholder')} maxLength={500} autoFocus />
      </Field>
    </Modal>
  );
}

export function ConfirmModal({ open, onClose, onConfirm, title, text, danger, loading }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; text?: string; danger?: boolean; loading?: boolean }) {
  const { t } = useTranslation();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex gap-2 pb-2">
          <Button variant="outline" block onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant={danger ? 'danger' : 'primary'} block loading={loading} onClick={onConfirm}>{t('common.confirm')}</Button>
        </div>
      }
    >
      {text && <p className="text-sm text-muted">{text}</p>}
    </Modal>
  );
}

// ---------------- Toast ----------------
type Toast = { id: number; kind: 'success' | 'error' | 'info'; text: string };
const ToastCtx = createContext<(kind: Toast['kind'], text: string) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    if (kind === 'error') haptic('error');
    if (kind === 'success') haptic('success');
    setItems((s) => [...s.slice(-2), { id, kind, text }]);
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), kind === 'error' ? 4500 : 2600);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 p-3" style={{ paddingTop: 'calc(var(--safe-top) + 12px)' }}>
        {items.map((it) => {
          const Icon = it.kind === 'success' ? CheckCircle2 : it.kind === 'error' ? AlertCircle : Info;
          return (
            <div
              key={it.id}
              className={clsx(
                'fade-in pointer-events-auto flex max-w-md items-start gap-2.5 rounded-2xl px-4 py-3 text-[14px] font-semibold shadow-lift',
                it.kind === 'error' ? 'bg-danger text-white' : it.kind === 'success' ? 'bg-primary-dark text-white' : 'bg-white text-ink',
              )}
            >
              <Icon className="mt-0.5 h-[18px] w-[18px] shrink-0" />
              <span>{it.text}</span>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const push = useContext(ToastCtx);
  return {
    success: (text: string) => push('success', text),
    info: (text: string) => push('info', text),
    error: (e: unknown) => push('error', e instanceof ApiError || e instanceof Error ? e.message : String(e)),
  };
}

// ---------------- Pagination ----------------
export function Pager({ page, pages, onChange }: { page: number; pages: number; onChange: (p: number) => void }) {
  const { t } = useTranslation();
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-center gap-3">
      <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onChange(page - 1)}>{t('common.prev')}</Button>
      <span className="text-sm font-semibold text-muted">{page} / {pages}</span>
      <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => onChange(page + 1)}>{t('common.next')}</Button>
    </div>
  );
}
