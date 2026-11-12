import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Boxes, Package, PackageCheck } from 'lucide-react';
import { get } from '../shared/api';
import type { Product } from '../shared/types';
import { Stat, Tabs } from '../shared/ui';
import { LowStockList, ManageProductsList, MovementsList, StockMoveModal } from '../shared/staffParts';
import { money } from '../shared/format';
import { AdminPage } from './common';

export function WarehousePage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'stock' | 'moves' | 'low'>('stock');
  const [product, setProduct] = useState<Product | null>(null);
  const summary = useQuery({ queryKey: ['stock-summary'], queryFn: () => get<{ products: number; active: number; value: number }>('/admin/stock/summary') });
  const low = useQuery({ queryKey: ['low-count'], queryFn: () => get<{ count: number }>('/manage/stock/low/count') });
  return (
    <AdminPage title={t('admin.warehouse')}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Stat icon={Package} label={t('admin.products')} value={summary.data?.products ?? '—'} />
          <Stat icon={PackageCheck} label={t('nav.low')} value={low.data?.count ?? '—'} tone={low.data?.count ? 'danger' : undefined} />
          <Stat icon={Boxes} label={t('admin.stockValue')} value={summary.data ? money(summary.data.value) : '—'} />
        </div>
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'stock', label: t('staff.currentStock') },
            { value: 'moves', label: t('nav.movements') },
            { value: 'low', label: `${t('nav.low')}${low.data?.count ? ` (${low.data.count})` : ''}` },
          ]}
        />
        <div className="max-w-3xl">
          {tab === 'stock' && <ManageProductsList onOpen={setProduct} />}
          {tab === 'moves' && <MovementsList />}
          {tab === 'low' && <LowStockList onOpen={setProduct} />}
        </div>
      </div>
      <StockMoveModal product={product} open={!!product} onClose={() => setProduct(null)} />
    </AdminPage>
  );
}
