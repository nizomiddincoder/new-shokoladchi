import { useImageOk } from './img';
import {
  Apple,
  Baby,
  Beef,
  Beer,
  Cake,
  Candy,
  Carrot,
  Cherry,
  Citrus,
  Coffee,
  Cookie,
  Croissant,
  CupSoda,
  Drumstick,
  Egg,
  Fish,
  Grape,
  IceCreamCone,
  Leaf,
  Milk,
  Package,
  Pizza,
  Salad,
  Sandwich,
  ShoppingBasket,
  Snowflake,
  Soup,
  Sparkles,
  Wheat,
  Wine,
  Droplets,
  Store,
  type LucideIcon,
} from 'lucide-react';

/** Kategoriya uchun tanlanadigan lucide ikonkalar */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  ShoppingBasket,
  Apple,
  Cherry,
  Grape,
  Citrus,
  Carrot,
  Salad,
  Leaf,
  Milk,
  Egg,
  Beef,
  Drumstick,
  Fish,
  Wheat,
  Croissant,
  Sandwich,
  Pizza,
  Cookie,
  Cake,
  Candy,
  IceCreamCone,
  Coffee,
  CupSoda,
  Droplets,
  Wine,
  Beer,
  Soup,
  Snowflake,
  Baby,
  Sparkles,
  Package,
  Store,
};

export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = CATEGORY_ICONS[name] || ShoppingBasket;
  return <Icon className={className} strokeWidth={1.9} />;
}

/** Kategoriya ko'rinishi: rasm bo'lsa rasm, bo'lmasa nomiga mos ikonka */
export function CategoryVisual({
  cat,
  className = 'h-16 w-16 rounded-2xl',
  iconClassName = 'h-7 w-7',
}: {
  cat: { iconName: string; imageUrl?: string | null };
  className?: string;
  iconClassName?: string;
}) {
  const img = useImageOk(cat.imageUrl);
  if (cat.imageUrl && img.ok) {
    return <img src={cat.imageUrl} alt="" loading="lazy" onError={img.onError} className={`shrink-0 bg-white object-cover ${className}`} />;
  }
  return (
    <span className={`flex shrink-0 items-center justify-center bg-primary-soft ${className}`}>
      <CategoryIcon name={cat.iconName} className={`text-primary ${iconClassName}`} />
    </span>
  );
}
