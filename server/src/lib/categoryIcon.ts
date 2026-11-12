/**
 * Kategoriya nomiga qarab mos lucide ikonkani tanlaydi (rasm bo'lmaganda ko'rsatiladi).
 * Nomlar web/src/shared/icons.tsx dagi CATEGORY_ICONS bilan mos.
 */
const RULES: [RegExp, string][] = [
  [/muzqaymoq|морож/, 'IceCreamCone'],
  [/shokolad|шоколад|konfet|конфет|shirinlik|сладост|candy/, 'Candy'],
  [/pechen|печен|cookie/, 'Cookie'],
  [/tort|торт|desert|десерт|pirojn|пирожн/, 'Cake'],
  [/non\b|^non|хлеб|bulka|булк|vypech|выпеч|pishiriq/, 'Croissant'],
  [/gilos|qulupnay|rezavor|ягод|вишн|клубник/, 'Cherry'],
  [/uzum|виноград/, 'Grape'],
  [/sitrus|limon|apelsin|mandarin|цитрус|лимон|апельсин/, 'Citrus'],
  [/meva|olma|фрукт|яблок|fruit/, 'Apple'],
  [/salat|салат/, 'Salad'],
  [/kokat|ko'kat|зелен|ziravor|специ|пряност/, 'Leaf'],
  [/sabzavot|sabzi|овощ|морков/, 'Carrot'],
  [/tuxum|яйц/, 'Egg'],
  [/sut|qatiq|pishloq|tvorog|qaymoq|yogurt|молоч|молок|сыр|творог|йогурт|кефир/, 'Milk'],
  [/tovuq|parranda|кур|птиц/, 'Drumstick'],
  [/goʻsht|go'sht|gosht|kolbasa|qiyma|мяс|гов|колбас|фарш/, 'Beef'],
  [/baliq|dengiz|рыб|море/, 'Fish'],
  [/yorma|guruch|makaron|\bun\b|^un\b|krupa|круп|мук|рис|макарон/, 'Wheat'],
  [/choy|qahva|kofe|чай|коф/, 'Coffee'],
  [/suv\b|^suv|вода|воды/, 'Droplets'],
  [/vino|алког|вин/, 'Wine'],
  [/pivo|пив/, 'Beer'],
  [/ichimlik|sharbat|gazli|напит|сок|лимонад/, 'CupSoda'],
  [/sho'rva|shorva|суп|bulyon/, 'Soup'],
  [/muzlatilgan|замороз/, 'Snowflake'],
  [/bolalar|chaqaloq|детск|малыш/, 'Baby'],
  [/gigiyena|tozalash|maishiy|бытов|гигиен|чист/, 'Sparkles'],
  [/konserva|консерв/, 'Package'],
  [/pitsa|pizza|пицц/, 'Pizza'],
  [/sendvich|бутерброд|сэндвич|fast/, 'Sandwich'],
];

export function guessCategoryIcon(...names: (string | null | undefined)[]): string {
  const text = names
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[ʻʼ`’‘]/g, "'");
  for (const [re, icon] of RULES) if (re.test(text)) return icon;
  return 'ShoppingBasket';
}
