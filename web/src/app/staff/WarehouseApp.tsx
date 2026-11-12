import { useState } from 'react';
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, History, Package, Pencil, SlidersHorizontal } from 'lucide-react';
import { get } from '../../shared/api';
import type { Product } from '../../shared/types';
import { Badge, Button, Card, ErrorState, PageLoader } from '../../shared/ui';
import { LowStockList, MovementsList, StockMoveModal } from '../../shared/staffParts';
import { ProductThumb } from '../../shared/orderParts';
import { money, nameOf, qty, unitLabel } from '../../shared/format';
import { BottomNav, PageHeader, Screen, TopTitle } from '../layout';
import { ProductEditScreen, ProductsScreen } from './SellerApp';

export function useLowCount() {
  return useQuery({ queryKey: ['low-count'], queryFn: () => get<{ count: number }>('/manage/stock/low/count'), refetchInterval: 60000 });
}

export function StockProductScreen() {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['manage-product', Number(id)], queryFn: () => get<Product>(`/manage/products/${id}`) });
  const [moveType, setMoveType] = useState<'IN' | 'OUT' | 'ADJUST' | null>(null);
  if (q.isLoading) return <PageLoader />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const p = q.data;
  return (
    <Screen withNav={false}>
      <PageHeader title={nameOf(p)} right={<Button size="sm" variant="ghost" icon={Pencil} onClick={() => navigate(`/products/${p.id}/edit`)}>{t('common.edit')}</Button>} />
      <div className="space-y-3 px-4 pt-3">
        <Card className="flex items-center gap-3 p-3">
          <ProductThumb url={p.image?.thumbUrl} className="h-20 w-20 rounded-xl" />
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-bold">{nameOf(p)}</div>
            <div className="text-[13px] text-muted">{money(p.price)} / {unitLabel(p.unit)}</div>
            {!p.isActive && <Badge tone="muted">{t('common.inactive')}</Badge>}
          </div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-[13px] font-semibold text-muted">{t('staff.currentStock')}</div>
          <div className={p.isLow ? 'text-[32px] font-extrabold text-danger' : 'text-[32px] font-extrabold text-primary-dark'}>
            {qty(p.stock)} <span className="text-[16px]">{unitLabel(p.unit)}</span>
          </div>
          {p.isLow && (
            <div className="mt-1 inline-flex items-center gap-1 text-[12px] font-bold text-danger">
              <AlertTriangle className="h-3.5 w-3.5" /> {t('nav.low')} (≤ {qty(p.lowStockThreshold)})
            </div>
          )}
        </Card>
        <div className="grid grid-cols-3 gap-2">
          <Button variant="success" icon={ArrowDownToLine} onClick={() => setMoveType('IN')}>{t('staff.stockIn')}</Button>
          <Button variant="danger" icon={ArrowUpFromLine} onClick={() => setMoveType('OUT')}>{t('staff.stockOut')}</Button>
          <Button variant="secondary" icon={SlidersHorizontal} onClick={() => setMoveType('ADJUST')}>{t('staff.stockAdjust')}</Button>
        </div>
        <h3 className="pt-2 text-[15px] font-bold">{t('nav.movements')}</h3>
        <MovementsList productId={p.id} compact />
      </div>
      <StockMoveModal product={p} open={!!moveType} initialType={moveType || 'IN'} onClose={() => setMoveType(null)} />
    </Screen>
  );
}

function LowScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <Screen>
      <TopTitle title={t('nav.low')} />
      <div className="px-4">
        <LowStockList onOpen={(p) => navigate(`/stock/${p.id}`)} />
      </div>
    </Screen>
  );
}

function MovementsScreen() {
  const { t } = useTranslation();
  return (
    <Screen>
      <TopTitle title={t('nav.movements')} />
      <div className="px-4">
        <MovementsList />
      </div>
    </Screen>
  );
}

export function WarehouseApp() {
  const { t } = useTranslation();
  const low = useLowCount();
  return (
    <>
      <Routes>
        <Route path="/" element={<ProductsScreen onOpenPath={(id) => `/stock/${id}`} />} />
        <Route path="/stock/:id" element={<StockProductScreen />} />
        <Route path="/products/new" element={<ProductEditScreen />} />
        <Route path="/products/:id/edit" element={<ProductEditScreen />} />
        <Route path="/warehouse/low" element={<LowScreen />} />
        <Route path="/movements" element={<MovementsScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Routes>
        {['/', '/warehouse/low', '/movements'].map((p) => (
          <Route
            key={p}
            path={p}
            element={
              <BottomNav
                items={[
                  { to: '/', icon: Package, label: t('nav.products'), end: true },
                  { to: '/warehouse/low', icon: AlertTriangle, label: t('nav.low'), badge: low.data?.count },
                  { to: '/movements', icon: History, label: t('nav.movements') },
                ]}
              />
            }
          />
        ))}
        <Route path="*" element={null} />
      </Routes>
    </>
  );
}
