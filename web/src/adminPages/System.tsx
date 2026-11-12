import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Download, FileSpreadsheet, History, ImageOff, ImagePlus, Send, Sparkles, Trash2 } from 'lucide-react';
import { get, post, put, qs, upload } from '../shared/api';
import { ShopLogo, type Branding } from '../shared/branding';
import type { AuditEntry, Paged, Settings } from '../shared/types';
import { Badge, Button, Card, Empty, ErrorState, Field, Modal, PageLoader, Pager, Stat, clsx, useToast } from '../shared/ui';
import { MapView } from '../shared/MapView';
import { dateTime, todayISO } from '../shared/format';
import { AdminPage, TableWrap, useAdminEnv } from './common';

type SettingsResp = {
  settings: Settings;
  ai: { total: number; success: number; failed: number; queue: number; enabled: boolean; model: string };
  bot: { username?: string };
};

export function SettingsPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-settings'], queryFn: () => get<SettingsResp>('/admin/settings') });
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);

  const onLogo = async (f?: File) => {
    if (!f) return;
    setLogoBusy(true);
    try {
      const r = await upload<{ url: string }>('/admin/uploads?folder=branding', f);
      // Logo darhol saqlanadi — admin panel va mini app'da shu zahoti yangilanadi
      if (s) await save({ ...s, logoUrl: r.url });
    } catch (e) {
      toast.error(e);
    } finally {
      setLogoBusy(false);
      if (logoRef.current) logoRef.current.value = '';
    }
  };
  useEffect(() => {
    if (q.data) setS(q.data.settings);
  }, [q.data]);
  if (q.isLoading || !s) return q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <PageLoader />;

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v });
  const int = (v: string) => Number(v.replace(/\D/g, '')) || 0;
  const save = async (next: Settings = s) => {
    const s = next;
    setS(next);
    setBusy(true);
    try {
      await put('/admin/settings', {
        shopName: s.shopName,
        logoUrl: s.logoUrl,
        shopPhone: s.shopPhone,
        shopAddress: s.shopAddress,
        shopLat: s.shopLat,
        shopLng: s.shopLng,
        workHoursStart: s.workHoursStart,
        workHoursEnd: s.workHoursEnd,
        deliveryFee: s.deliveryFee,
        freeDeliveryFrom: s.freeDeliveryFrom,
        minOrderAmount: s.minOrderAmount,
        acceptTimeoutMinutes: s.acceptTimeoutMinutes,
      });
      toast.success(t('common.saved'));
      // Sidebar/login logosi va nomi darhol yangilanadi
      qc.setQueryData<Branding>(['branding'], { shopName: s.shopName, logoUrl: s.logoUrl ?? null });
      await qc.invalidateQueries({ queryKey: ['admin-settings'] });
      await qc.invalidateQueries({ queryKey: ['branding'] });
      await qc.invalidateQueries({ queryKey: ['home'] });
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  const ai = q.data!.ai;

  return (
    <AdminPage title={t('admin.settings')} actions={<Button size="sm" loading={busy} onClick={() => save()}>{t('common.save')}</Button>}>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-4">
          <Field label={t('admin.logo')} hint={t('admin.logoHint')}>
            <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={(e) => onLogo(e.target.files?.[0])} />
            <div className="flex items-center gap-3">
              <ShopLogo url={s.logoUrl} className="h-20 w-20 border border-line" />
              <div className="flex flex-col gap-2">
                <Button type="button" size="sm" variant="secondary" icon={ImagePlus} loading={logoBusy} onClick={() => logoRef.current?.click()}>
                  {t('admin.uploadLogo')}
                </Button>
                {s.logoUrl && (
                  <Button type="button" size="sm" variant="ghost" className="text-danger" onClick={() => void save({ ...s, logoUrl: null })}>
                    {t('admin.removeLogo')}
                  </Button>
                )}
              </div>
            </div>
          </Field>
          <Field label={t('admin.shopName')}>
            <input className="input" value={s.shopName} onChange={(e) => set('shopName', e.target.value)} />
          </Field>
          <Field label={t('admin.shopPhone')}>
            <input className="input" value={s.shopPhone} onChange={(e) => set('shopPhone', e.target.value)} placeholder="+998 90 123 45 67" />
          </Field>
          <Field label={t('admin.shopAddress')}>
            <textarea className="input min-h-[64px]" value={s.shopAddress} onChange={(e) => set('shopAddress', e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('admin.shopLat')}>
              <input className="input" inputMode="decimal" value={s.shopLat ?? ''} onChange={(e) => set('shopLat', e.target.value === '' ? null : Number(e.target.value))} />
            </Field>
            <Field label={t('admin.shopLng')}>
              <input className="input" inputMode="decimal" value={s.shopLng ?? ''} onChange={(e) => set('shopLng', e.target.value === '' ? null : Number(e.target.value))} />
            </Field>
          </div>
          <div className="text-[12px] text-muted">{t('admin.pickOnMap')}</div>
          <MapView lat={s.shopLat} lng={s.shopLng} height={220} onPick={(lat, lng) => setS({ ...s, shopLat: Math.round(lat * 1e6) / 1e6, shopLng: Math.round(lng * 1e6) / 1e6 })} />
        </Card>
        <div className="space-y-4">
          <Card className="grid grid-cols-2 gap-3 p-4">
            <Field label={t('admin.workStart')}>
              <input type="time" className="input" value={s.workHoursStart} onChange={(e) => set('workHoursStart', e.target.value)} />
            </Field>
            <Field label={t('admin.workEnd')}>
              <input type="time" className="input" value={s.workHoursEnd} onChange={(e) => set('workHoursEnd', e.target.value)} />
            </Field>
            <Field label={t('admin.deliveryFee')}>
              <input className="input" inputMode="numeric" value={s.deliveryFee} onChange={(e) => set('deliveryFee', int(e.target.value))} />
            </Field>
            <Field label={t('admin.freeDeliveryFrom')}>
              <input className="input" inputMode="numeric" value={s.freeDeliveryFrom} onChange={(e) => set('freeDeliveryFrom', int(e.target.value))} />
            </Field>
            <Field label={t('admin.minOrder')}>
              <input className="input" inputMode="numeric" value={s.minOrderAmount} onChange={(e) => set('minOrderAmount', int(e.target.value))} />
            </Field>
            <Field label={t('admin.acceptTimeout')}>
              <input className="input" inputMode="numeric" value={s.acceptTimeoutMinutes} onChange={(e) => set('acceptTimeoutMinutes', int(e.target.value))} />
            </Field>
          </Card>
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-[15px] font-bold">
                <Sparkles className="h-4 w-4 text-accent" /> {t('admin.aiUsage')}
              </h3>
              <Badge tone="muted">{ai.model}</Badge>
            </div>
            {!ai.enabled && <div className="mb-3 rounded-xl bg-warning-soft p-3 text-[13px] font-semibold text-warning">{t('admin.aiDisabled')}</div>}
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Stat label={t('admin.aiCalls')} value={ai.total} />
              <Stat label={t('admin.aiSuccess')} value={ai.success} />
              <Stat label={t('admin.aiFailed')} value={ai.failed} tone={ai.failed ? 'danger' : undefined} />
              <Stat label={t('admin.aiQueue')} value={ai.queue} />
            </div>
          </Card>
          <StorageHealthCard />
          <Button block size="lg" loading={busy} onClick={() => save()}>{t('common.save')}</Button>
          <ResetDataCard />
        </div>
      </div>
    </AdminPage>
  );
}

type StorageHealth = {
  total: number;
  volume: boolean;
  missing: { kind: 'logo' | 'banner' | 'category' | 'product' | 'template'; id: number | null; name: string; url: string }[];
};

const FIX_PATH: Record<StorageHealth['missing'][number]['kind'], (id: number | null) => string> = {
  logo: () => '/settings',
  banner: () => '/banners',
  category: () => '/categories',
  product: (id) => `/products/${id}`,
  template: () => '/templates',
};

type ResetKey = 'orders' | 'catalog' | 'customers' | 'stock';

/** Test ma'lumotlarini tozalash: dasturni 0 holatga keltirish */
function ResetDataCard() {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [word, setWord] = useState('');
  const [opts, setOpts] = useState<Record<ResetKey, boolean>>({ orders: true, catalog: true, customers: true, stock: false });
  const toggle = (k: ResetKey, v: boolean) =>
    setOpts((o) => {
      const n = { ...o, [k]: v };
      if (k === 'customers' && v) n.orders = true; // mijozlarsiz buyurtma qolmaydi
      if (k === 'orders' && !v) n.customers = false;
      return n;
    });
  const any = opts.orders || opts.catalog || opts.customers || opts.stock;
  const run = async () => {
    setBusy(true);
    try {
      await post('/admin/reset', { ...opts, confirm: word });
      toast.success(t('admin.resetDone'));
      setOpen(false);
      setWord('');
      await qc.invalidateQueries();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  const items: { key: ResetKey; label: string; hint: string; disabled?: boolean }[] = [
    { key: 'orders', label: t('admin.resetOrders'), hint: t('admin.resetOrdersHint') },
    { key: 'catalog', label: t('admin.resetCatalog'), hint: t('admin.resetCatalogHint') },
    { key: 'customers', label: t('admin.resetCustomers'), hint: t('admin.resetCustomersHint') },
    { key: 'stock', label: t('admin.resetStock'), hint: t('admin.resetStockHint'), disabled: opts.catalog },
  ];
  return (
    <Card className="border border-danger/40 p-4">
      <h3 className="mb-1 flex items-center gap-2 text-[15px] font-bold text-danger">
        <Trash2 className="h-4 w-4" /> {t('admin.resetTitle')}
      </h3>
      <p className="mb-3 text-[13px] text-muted">{t('admin.resetText')}</p>
      <Button block variant="danger" icon={Trash2} onClick={() => setOpen(true)}>{t('admin.resetOpen')}</Button>
      <Modal
        open={open}
        onClose={() => !busy && setOpen(false)}
        title={t('admin.resetTitle')}
        footer={
          <div className="pb-2">
            <Button block variant="danger" loading={busy} disabled={!any || word.trim().toUpperCase() !== 'TOZALASH'} onClick={run}>
              {t('admin.resetRun')}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          {items.map((it) => (
            <label key={it.key} className={clsx('flex gap-3 rounded-xl border border-line p-3', it.disabled && 'opacity-40')}>
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-danger"
                disabled={it.disabled}
                checked={!it.disabled && opts[it.key]}
                onChange={(e) => toggle(it.key, e.target.checked)}
              />
              <span>
                <span className="block text-[14px] font-bold">{it.label}</span>
                <span className="block text-[12px] text-muted">{it.hint}</span>
              </span>
            </label>
          ))}
          <div className="rounded-xl bg-danger-soft p-3 text-[13px] font-semibold text-danger">{t('admin.resetWarn')}</div>
          <Field label={t('admin.resetConfirmLabel')}>
            <input className="input" value={word} onChange={(e) => setWord(e.target.value)} placeholder="TOZALASH" autoComplete="off" />
          </Field>
        </div>
      </Modal>
    </Card>
  );
}

/** Serverda topilmagan rasmlar: ularni qayta yuklash kerak */
function StorageHealthCard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['storage-health'], queryFn: () => get<StorageHealth>('/admin/storage/health'), staleTime: 60_000 });
  if (!q.data) return null;
  const { missing } = q.data;
  return (
    <Card className="p-4">
      <h3 className="mb-2 flex items-center gap-2 text-[15px] font-bold">
        <ImageOff className="h-4 w-4 text-primary" /> {t('admin.imagesHealth')}
      </h3>
      {missing.length === 0 ? (
        <div className="rounded-xl bg-success-soft p-3 text-[13px] font-semibold text-success">{t('admin.imagesOk', { count: q.data.total })}</div>
      ) : (
        <>
          <div className="mb-2 rounded-xl bg-danger-soft p-3 text-[13px] font-semibold text-danger">{t('admin.imagesMissing', { count: missing.length })}</div>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {missing.map((m) => (
              <button
                key={`${m.kind}-${m.id}`}
                onClick={() => navigate(FIX_PATH[m.kind](m.id))}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-surface"
              >
                <span className="min-w-0 truncate">
                  <span className="text-muted">{t(`admin.imgKind.${m.kind}`)}:</span> <b>{m.name}</b>
                </span>
                <span className="shrink-0 font-bold text-primary">{t('admin.reupload')} →</span>
              </button>
            ))}
          </div>
        </>
      )}
      {!q.data.volume && <p className="mt-2 text-[12px] text-muted">{t('admin.noVolumeHint')}</p>}
    </Card>
  );
}

const EXPORTS = [
  { type: 'orders', key: 'admin.exportOrders' },
  { type: 'customers', key: 'admin.exportCustomers' },
  { type: 'products', key: 'admin.exportProducts' },
  { type: 'stock', key: 'admin.exportStock' },
] as const;

export function ExportPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const { isWeb } = useAdminEnv();
  const [busy, setBusy] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(todayISO());

  const sendToChat = async (type: string) => {
    setBusy(type);
    try {
      await post(`/admin/export/${type}/send`);
      toast.success(t('admin.sentToChat'));
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminPage title={t('admin.export')}>
      <div className="grid gap-3 md:grid-cols-2">
        {EXPORTS.map((e) => (
          <Card key={e.type} className="space-y-3 p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
              </span>
              <div className="text-[15px] font-bold">{t(e.key)}</div>
            </div>
            {e.type === 'orders' && isWeb && (
              <div className="flex items-center gap-2">
                <input type="date" className="input h-9 py-1 text-[13px]" value={from} onChange={(ev) => setFrom(ev.target.value)} />
                <span className="text-muted">—</span>
                <input type="date" className="input h-9 py-1 text-[13px]" value={to} onChange={(ev) => setTo(ev.target.value)} />
              </div>
            )}
            {isWeb ? (
              <a
                href={`/api/admin/export/${e.type}${e.type === 'orders' && from && to ? qs({ from, to }) : ''}`}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-[14px] font-semibold text-white hover:brightness-110"
              >
                <Download className="h-[18px] w-[18px]" /> {t('admin.download')}
              </a>
            ) : (
              <Button block icon={Send} loading={busy === e.type} onClick={() => sendToChat(e.type)}>
                {t('admin.sendToChat')}
              </Button>
            )}
          </Card>
        ))}
      </div>
    </AdminPage>
  );
}

export function AuditPage() {
  const { t } = useTranslation();
  const [entity, setEntity] = useState('');
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['audit', entity, page], queryFn: () => get<Paged<AuditEntry>>(`/admin/audit${qs({ entity, page, limit: 50 })}`) });
  const short = (v: unknown) => {
    if (v == null) return '';
    const s = JSON.stringify(v);
    return s.length > 160 ? s.slice(0, 160) + '…' : s;
  };
  return (
    <AdminPage title={t('admin.audit')}>
      <div className="space-y-3">
        <select className="input h-10 w-auto py-1" value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }}>
          <option value="">{t('common.all')}</option>
          {['Order', 'Product', 'Category', 'User', 'Invite', 'Settings', 'Banner', 'Broadcast', 'AdminAccount'].map((x) => (
            <option key={x} value={x}>{x}</option>
          ))}
        </select>
        {q.isLoading && <PageLoader />}
        {q.data?.items.length === 0 && <Empty icon={History} title={t('common.empty')} />}
        {q.data && q.data.items.length > 0 && (
          <TableWrap>
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t('common.date')}</th>
                  <th>{t('admin.who')}</th>
                  <th>{t('admin.action')}</th>
                  <th>{t('admin.entity')}</th>
                  <th>{t('admin.changes')}</th>
                </tr>
              </thead>
              <tbody>
                {q.data.items.map((a) => (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap text-muted">{dateTime(a.createdAt)}</td>
                    <td className="whitespace-nowrap font-semibold">{a.actorLabel || '—'}</td>
                    <td className="whitespace-nowrap"><Badge>{a.action}</Badge></td>
                    <td className="whitespace-nowrap">{a.entity}{a.entityId ? ` #${a.entityId}` : ''}</td>
                    <td className="max-w-[420px] font-mono text-[11px] text-muted">
                      {a.before != null && <div className="truncate">− {short(a.before)}</div>}
                      {a.after != null && <div className="truncate">+ {short(a.after)}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        {q.data && <Pager page={page} pages={q.data.pages} onChange={setPage} />}
      </div>
    </AdminPage>
  );
}
