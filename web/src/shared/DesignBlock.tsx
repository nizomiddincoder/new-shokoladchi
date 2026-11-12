import { useTranslation } from 'react-i18next';
import { Download, Gift } from 'lucide-react';
import type { Order } from './types';
import { Card } from './ui';
import { qty, unitLabel } from './format';

/** "Mening shokoladim" dizaynlari: rasm + asl sifatdagi JPG ni yuklab olish */
export function DesignBlock({ order, download = true }: { order: Order; download?: boolean }) {
  const { t } = useTranslation();
  const designs = order.items.filter((i) => i.designUrl);
  if (!designs.length) return null;
  return (
    <Card className="space-y-3 p-4">
      <h3 className="flex items-center gap-2 text-[15px] font-bold text-primary-dark">
        <Gift className="h-4 w-4 text-accent" /> {t('personal.design')}
      </h3>
      {designs.map((it, i) => (
        <div key={it.id} className="space-y-2">
          <a href={it.designUrl!} target="_blank" rel="noreferrer">
            <img src={it.designUrl!} alt="" className="w-full rounded-xl border border-line bg-white" />
          </a>
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-muted">
              {qty(it.qty)} {unitLabel(it.unit)}
            </span>
            {download && (
              <a
                href={it.designUrl!}
                download={`buyurtma-${order.number}${designs.length > 1 ? `-${i + 1}` : ''}.jpg`}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary-soft px-3 py-2 font-bold text-primary-dark"
              >
                <Download className="h-4 w-4" /> {t('personal.downloadJpg')}
              </a>
            )}
          </div>
        </div>
      ))}
    </Card>
  );
}
