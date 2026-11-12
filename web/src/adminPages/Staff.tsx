import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import QRCode from 'qrcode';
import { Ban, CircleCheck, Copy, Link2, Phone, ShieldCheck, UserMinus, UserPlus, Users } from 'lucide-react';
import { del, get, patch, post } from '../shared/api';
import type { Role } from '../shared/types';
import { Badge, Button, Card, ConfirmModal, Empty, ErrorState, Field, Modal, Stat, Tabs, useToast } from '../shared/ui';
import { OrdersListSkeleton } from '../shared/staffParts';
import { dateTime, money, phoneHref, prettyPhone } from '../shared/format';
import { AdminPage } from './common';

type StaffRow = {
  id: number;
  firstName: string;
  lastName: string;
  phone: string | null;
  username: string | null;
  role: Role;
  isBlocked: boolean;
  isMainAdmin: boolean;
  createdAt: string;
  ordersAccepted: number;
  ordersDelivered: number;
};

type Invite = {
  id: number;
  token: string;
  role: Role;
  staffName: string;
  expiresAt: string;
  createdAt: string;
  link: string;
  state: 'ACTIVE' | 'USED' | 'REVOKED' | 'EXPIRED';
  usedBy?: { firstName: string; lastName: string; phone: string | null } | null;
};

type StaffStats = {
  accepted: number;
  completed: number;
  cancelled: number;
  revenue: number;
  delivered: number;
  stockMovements: number;
  productsCreated: number;
  avgAcceptMin: number | null;
  avgDeliveryMin: number | null;
};

const ROLES: Role[] = ['SELLER', 'WAREHOUSE', 'ADMIN'];

function copyText(text: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
  return Promise.resolve();
}

function InviteResult({ invite }: { invite: Invite }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [qr, setQr] = useState('');
  useEffect(() => {
    QRCode.toDataURL(invite.link, { width: 260, margin: 1, color: { dark: '#4A3224', light: '#FFFFFF' } }).then(setQr).catch(() => setQr(''));
  }, [invite.link]);
  return (
    <div className="space-y-3 text-center">
      <div className="text-[14px]">
        <b>{invite.staffName}</b> · {t(`role.${invite.role}`)}
      </div>
      {qr && <img src={qr} alt="QR" className="mx-auto h-56 w-56 rounded-2xl border border-line" />}
      <div className="break-all rounded-xl bg-surface p-3 text-left font-mono text-[12px]">{invite.link}</div>
      <Button
        block
        icon={Copy}
        onClick={() =>
          copyText(invite.link)
            .then(() => toast.success(t('common.copied')))
            .catch((e) => toast.error(e))
        }
      >
        {t('common.copy')}
      </Button>
      <p className="text-[12px] text-muted">{t('admin.inviteHint')}</p>
    </div>
  );
}

export function StaffPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'staff' | 'invites'>('staff');
  const staff = useQuery({ queryKey: ['admin-staff'], queryFn: () => get<StaffRow[]>('/admin/staff') });
  const invites = useQuery({ queryKey: ['admin-invites'], queryFn: () => get<Invite[]>('/admin/invites'), enabled: tab === 'invites' });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState<{ staffName: string; role: Role }>({ staffName: '', role: 'SELLER' });
  const [created, setCreated] = useState<Invite | null>(null);
  const [showInvite, setShowInvite] = useState<Invite | null>(null);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<StaffRow | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const stats = useQuery({
    queryKey: ['staff-stats-admin', detail?.id],
    queryFn: () => get<StaffStats>(`/admin/staff/${detail!.id}/stats?preset=30d`),
    enabled: !!detail,
  });

  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['admin-staff'] }), qc.invalidateQueries({ queryKey: ['admin-invites'] })]);

  const createInvite = async () => {
    setBusy(true);
    try {
      const inv = await post<Invite>('/admin/invites', inviteForm);
      setCreated(inv);
      await refresh();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  const revoke = async (id: number) => {
    try {
      await post(`/admin/invites/${id}/revoke`);
      await refresh();
    } catch (e) {
      toast.error(e);
    }
  };
  const updateStaff = async (data: { role?: Role; isBlocked?: boolean }) => {
    if (!detail) return;
    setBusy(true);
    try {
      await patch(`/admin/staff/${detail.id}`, data);
      setDetail({ ...detail, ...data });
      toast.success(t('common.saved'));
      await refresh();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  const removeStaff = async () => {
    if (!detail) return;
    setBusy(true);
    try {
      await del(`/admin/staff/${detail.id}`);
      setConfirmRemove(false);
      setDetail(null);
      await refresh();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminPage
      title={t('admin.staff')}
      actions={
        <Button
          size="sm"
          icon={UserPlus}
          onClick={() => {
            setInviteForm({ staffName: '', role: 'SELLER' });
            setCreated(null);
            setInviteOpen(true);
          }}
        >
          {t('admin.inviteStaff')}
        </Button>
      }
    >
      <div className="space-y-3">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'staff', label: t('admin.staff') },
            { value: 'invites', label: t('admin.invites') },
          ]}
        />
        {tab === 'staff' && (
          <>
            {staff.isLoading && <OrdersListSkeleton />}
            {staff.error && <ErrorState error={staff.error} onRetry={() => staff.refetch()} />}
            {staff.data?.length === 0 && <Empty icon={Users} title={t('common.empty')} />}
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {staff.data?.map((s) => (
                <Card key={s.id} className="p-3.5" onClick={() => setDetail(s)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-bold">{`${s.firstName} ${s.lastName}`.trim()}</div>
                      <div className="text-[13px] text-muted">{prettyPhone(s.phone)}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge tone={s.role === 'ADMIN' ? 'primary' : 'soft'}>{t(`role.${s.role}`)}</Badge>
                      {s.isBlocked && <Badge tone="danger">{t('common.blocked')}</Badge>}
                      {s.isMainAdmin && <Badge tone="accent">{t('admin.mainAdmin')}</Badge>}
                    </div>
                  </div>
                  <div className="mt-2 text-[12px] text-muted">
                    {s.role === 'SELLER' || s.role === 'ADMIN' ? `${t('admin.accepted')}: ${s.ordersAccepted} · ${t('admin.delivered')}: ${s.ordersDelivered}` : dateTime(s.createdAt)}
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
        {tab === 'invites' && (
          <div className="space-y-2">
            {invites.isLoading && <OrdersListSkeleton />}
            {invites.data?.length === 0 && <Empty icon={Link2} title={t('common.empty')} />}
            {invites.data?.map((inv) => (
              <Card key={inv.id} className="flex flex-wrap items-center gap-3 p-3.5">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">
                    {inv.staffName} · <span className="text-muted">{t(`role.${inv.role}`)}</span>
                  </div>
                  <div className="text-[12px] text-muted">
                    {dateTime(inv.createdAt)} → {dateTime(inv.expiresAt)}
                    {inv.usedBy && ` · ${inv.usedBy.firstName} ${prettyPhone(inv.usedBy.phone)}`}
                  </div>
                </div>
                <Badge tone={inv.state === 'ACTIVE' ? 'success' : inv.state === 'USED' ? 'soft' : 'muted'}>{t(`admin.inviteState.${inv.state}`)}</Badge>
                {inv.state === 'ACTIVE' && (
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="secondary" icon={Link2} onClick={() => setShowInvite(inv)}>{t('admin.inviteLink')}</Button>
                    <Button size="sm" variant="outline" className="text-danger" onClick={() => revoke(inv.id)}>{t('admin.revoke')}</Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Taklif yaratish */}
      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title={t('admin.inviteStaff')}
        footer={
          !created && (
            <div className="pb-2">
              <Button block loading={busy} disabled={inviteForm.staffName.trim().length < 2} onClick={createInvite}>
                {t('common.create')}
              </Button>
            </div>
          )
        }
      >
        {created ? (
          <InviteResult invite={created} />
        ) : (
          <div className="space-y-3">
            <Field label={t('admin.staffName')}>
              <input className="input" value={inviteForm.staffName} onChange={(e) => setInviteForm({ ...inviteForm, staffName: e.target.value })} maxLength={60} autoFocus />
            </Field>
            <Field label={t('admin.role')}>
              <div className="grid grid-cols-2 gap-2">
                {(['SELLER', 'WAREHOUSE'] as Role[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setInviteForm({ ...inviteForm, role: r })}
                    className={inviteForm.role === r ? 'rounded-xl border border-primary bg-primary py-2.5 text-[13px] font-bold text-white' : 'rounded-xl border border-line py-2.5 text-[13px] font-semibold'}
                  >
                    {t(`role.${r}`)}
                  </button>
                ))}
              </div>
            </Field>
            <p className="text-[12px] text-muted">{t('admin.inviteHint')}</p>
          </div>
        )}
      </Modal>

      <Modal open={!!showInvite} onClose={() => setShowInvite(null)} title={t('admin.inviteLink')}>
        {showInvite && <InviteResult invite={showInvite} />}
      </Modal>

      {/* Xodim tafsilotlari */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `${detail.firstName} ${detail.lastName}`.trim() : ''}>
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-[14px]">
              <a href={phoneHref(detail.phone)} className="inline-flex items-center gap-1 font-bold text-primary">
                <Phone className="h-4 w-4" /> {prettyPhone(detail.phone)}
              </a>
              {detail.username && <span className="text-muted">@{detail.username}</span>}
              <Badge>{t(`role.${detail.role}`)}</Badge>
            </div>
            <div>
              <div className="mb-2 text-[13px] font-bold text-muted">{t('admin.staffStats')}</div>
              <div className="grid grid-cols-2 gap-2">
                {(detail.role === 'SELLER' || detail.role === 'ADMIN') && (
                  <>
                    <Stat label={t('admin.accepted')} value={stats.data?.accepted ?? '—'} />
                    <Stat label={t('common.sum')} value={stats.data ? money(stats.data.revenue) : '—'} />
                    <Stat label={t('admin.avgAccept')} value={stats.data?.avgAcceptMin != null ? `${stats.data.avgAcceptMin} ${t('common.min')}` : '—'} />
                    <Stat label={t('staff.cancelledCount')} value={stats.data?.cancelled ?? '—'} tone="danger" />
                    <Stat label={t('admin.delivered')} value={stats.data?.delivered ?? '—'} />
                    <Stat label={t('admin.avgDelivery')} value={stats.data?.avgDeliveryMin != null ? `${stats.data.avgDeliveryMin} ${t('common.min')}` : '—'} />
                  </>
                )}
                {detail.role === 'WAREHOUSE' && (
                  <>
                    <Stat label={t('admin.stockMoves')} value={stats.data?.stockMovements ?? '—'} />
                    <Stat label={t('admin.productsCreated')} value={stats.data?.productsCreated ?? '—'} />
                  </>
                )}
              </div>
            </div>
            {!detail.isMainAdmin ? (
              <>
                <Field label={t('admin.changeRole')}>
                  <select className="input" value={detail.role} disabled={busy} onChange={(e) => updateStaff({ role: e.target.value as Role })}>
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{t(`role.${r}`)}</option>
                    ))}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant={detail.isBlocked ? 'success' : 'outline'} icon={detail.isBlocked ? CircleCheck : Ban} loading={busy} onClick={() => updateStaff({ isBlocked: !detail.isBlocked })}>
                    {detail.isBlocked ? t('admin.unblock') : t('admin.block')}
                  </Button>
                  <Button variant="danger" icon={UserMinus} onClick={() => setConfirmRemove(true)}>
                    {t('admin.removeStaff')}
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 rounded-xl bg-primary-soft p-3 text-[13px] font-semibold text-primary-dark">
                <ShieldCheck className="h-4 w-4" /> {t('admin.mainAdmin')}
              </div>
            )}
          </div>
        )}
      </Modal>
      <ConfirmModal open={confirmRemove} onClose={() => setConfirmRemove(false)} onConfirm={removeStaff} loading={busy} danger title={t('admin.removeStaff')} text={t('admin.removeStaffConfirm')} />
    </AdminPage>
  );
}
