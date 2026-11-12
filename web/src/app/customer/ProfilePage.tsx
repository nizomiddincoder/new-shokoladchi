import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Clock, Heart, Languages, MapPin, Phone, UserRound } from 'lucide-react';
import { get, patch } from '../../shared/api';
import type { Product } from '../../shared/types';
import { Button, Card, Empty, Field, Segmented, useToast } from '../../shared/ui';
import { phoneHref, prettyPhone } from '../../shared/format';
import { setLanguage } from '../../shared/i18n';
import { PageHeader, Screen, TopTitle } from '../layout';
import { useMe } from '../meContext';
import { useShopSettings } from './hooks';
import { ProductGrid, ProductGridSkeleton } from './ProductCard';

export function ProfilePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const me = useMe();
  const settings = useShopSettings();
  const [firstName, setFirst] = useState(me.firstName || '');
  const [lastName, setLast] = useState(me.lastName || '');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setFirst(me.firstName || '');
    setLast(me.lastName || '');
  }, [me.firstName, me.lastName]);

  const changed = firstName.trim() !== (me.firstName || '') || lastName.trim() !== (me.lastName || '');

  const save = async () => {
    setSaving(true);
    try {
      await patch('/shop/me', { firstName: firstName.trim(), lastName: lastName.trim() });
      await qc.invalidateQueries({ queryKey: ['me'] });
      toast.success(t('common.saved'));
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };

  const changeLang = async (lang: 'uz' | 'ru') => {
    setLanguage(lang);
    try {
      await patch('/shop/me', { language: lang });
      await qc.invalidateQueries({ queryKey: ['me'] });
    } catch (e) {
      toast.error(e);
    }
  };

  const s = settings.data;
  return (
    <Screen>
      <TopTitle title={t('profile.title')} />
      <div className="space-y-3 px-4">
        <Card className="space-y-3 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft">
              <UserRound className="h-6 w-6 text-primary" />
            </div>
            <div>
              <div className="text-[16px] font-bold">{`${me.firstName || ''} ${me.lastName || ''}`.trim()}</div>
              <div className="flex items-center gap-1 text-[13px] text-muted">
                <Phone className="h-3.5 w-3.5" />
                {prettyPhone(me.phone)}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('profile.firstName')}>
              <input className="input" value={firstName} onChange={(e) => setFirst(e.target.value)} maxLength={60} />
            </Field>
            <Field label={t('profile.lastName')}>
              <input className="input" value={lastName} onChange={(e) => setLast(e.target.value)} maxLength={60} />
            </Field>
          </div>
          {changed && (
            <Button block loading={saving} disabled={!firstName.trim()} onClick={save}>
              {t('common.save')}
            </Button>
          )}
        </Card>

        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2 text-[14px] font-bold">
            <Languages className="h-4 w-4 text-primary" /> {t('common.language')}
          </div>
          <Segmented
            value={i18n.language === 'ru' ? 'ru' : 'uz'}
            onChange={(v) => void changeLang(v)}
            items={[
              { value: 'uz', label: "O'zbekcha" },
              { value: 'ru', label: 'Русский' },
            ]}
          />
        </Card>

        <Card className="flex items-center justify-between p-4" onClick={() => navigate('/favorites')}>
          <div className="flex items-center gap-2.5 text-[15px] font-semibold">
            <Heart className="h-5 w-5 text-primary" />
            {t('profile.favorites')}
          </div>
          <ChevronRight className="h-5 w-5 text-muted" />
        </Card>

        {s && (
          <Card className="space-y-2.5 p-4 text-[14px]">
            <div className="text-[15px] font-bold">{s.shopName}</div>
            {s.shopAddress && (
              <div className="flex gap-2 text-ink">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary-light" />
                {s.shopAddress}
              </div>
            )}
            {s.shopPhone && (
              <a href={phoneHref(s.shopPhone)} className="flex items-center gap-2 font-semibold text-primary">
                <Phone className="h-4 w-4" />
                {s.shopPhone}
              </a>
            )}
            <div className="flex items-center gap-2 text-muted">
              <Clock className="h-4 w-4" />
              {t('profile.workHours')}: {s.workHoursStart} - {s.workHoursEnd}
            </div>
          </Card>
        )}
      </div>
    </Screen>
  );
}

export function FavoritesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['favorites'], queryFn: () => get<Product[]>('/shop/favorites') });
  return (
    <Screen withNav={false}>
      <PageHeader title={t('profile.favorites')} />
      <div className="px-4 pt-3">
        {q.isLoading ? (
          <ProductGridSkeleton n={4} />
        ) : q.data?.length ? (
          <ProductGrid items={q.data} />
        ) : (
          <Empty icon={Heart} title={t('profile.noFavorites')} text={t('profile.noFavoritesText')} action={<Button onClick={() => navigate('/catalog')}>{t('cart.goCatalog')}</Button>} />
        )}
      </div>
    </Screen>
  );
}
