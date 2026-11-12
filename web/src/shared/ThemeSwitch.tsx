import { useTranslation } from 'react-i18next';
import { Moon, Palette, Sun } from 'lucide-react';
import { Card, Segmented } from './ui';
import { useTheme } from './theme';

/** Profil va menyu sahifalari uchun "Kun / Tun" tanlovi */
export function ThemeSwitchCard() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-2 text-[14px] font-bold">
        <Palette className="h-4 w-4 text-primary" /> {t('theme.title')}
      </div>
      <Segmented
        value={theme}
        onChange={setTheme}
        items={[
          { value: 'light', label: t('theme.light'), icon: Sun },
          { value: 'dark', label: t('theme.dark'), icon: Moon },
        ]}
      />
    </Card>
  );
}
