import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Download, FileSpreadsheet, History, Send, Sparkles } from 'lucide-react';
import { get, post, put, qs } from '../shared/api';
import type { AuditEntry, Paged, Settings } from '../shared/types';
import { Badge, Button, Card, Empty, ErrorState, Field, PageLoader, Pager, Stat, useToast } from '../shared/ui';
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
  useEffect(() => {
    if (q.data) setS(q.data.settings);
  }, [q.data]);
  if (q.isLoading || !s) return q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <PageLoader />;

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v });
  const int = (v: string) => Number(v.replace(/\D/g, '')) || 0;
  const save = async () => {
    setBusy(true);
    try {
      await put('/admin/settings', {
        shopName: s.shopName,
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
      await qc.invalidateQueries({ queryKey: ['admin-settings'] });
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  const ai = q.data!.ai;

  return (
    <AdminPage title={t('admin.settings')} actions={<Button size="sm" loading={busy} onClick={save}>{t('common.save')}</Button>}>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-4">
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
            {!ai.enabled && <div className="mb-3 rounded-xl bg-[#FCF1E3] p-3 text-[13px] font-semibold text-[#A86A1E]">{t('admin.aiDisabled')}</div>}
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Stat label={t('admin.aiCalls')} value={ai.total} />
              <Stat label={t('admin.aiSuccess')} value={ai.success} />
              <Stat label={t('admin.aiFailed')} value={ai.failed} tone={ai.failed ? 'danger' : undefined} />
              <Stat label={t('admin.aiQueue')} value={ai.queue} />
            </div>
          </Card>
          <Button block size="lg" loading={busy} onClick={save}>{t('common.save')}</Button>
        </div>
      </div>
    </AdminPage>
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
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-[14px] font-semibold text-white hover:bg-primary-dark"
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
