import type { PrismaClient, Unit } from '@prisma/client';

type SeedProduct = {
  nameUz: string;
  nameRu: string;
  descriptionUz: string;
  descriptionRu: string;
  price: number;
  oldPrice?: number;
  unit: Unit;
  step: number;
  minQty: number;
  stock: number;
  lowStockThreshold: number;
};

const CATEGORIES: { nameUz: string; nameRu: string; iconName: string; products: SeedProduct[] }[] = [
  {
    nameUz: 'Mevalar',
    nameRu: 'Фрукты',
    iconName: 'Apple',
    products: [
      { nameUz: 'Olma Golden', nameRu: 'Яблоко Голден', descriptionUz: 'Shirin va suvli sariq olma', descriptionRu: 'Сладкое и сочное жёлтое яблоко', price: 18000, unit: 'KG', step: 0.5, minQty: 0.5, stock: 120, lowStockThreshold: 10 },
      { nameUz: 'Banan', nameRu: 'Бананы', descriptionUz: 'Ekvador bananlari', descriptionRu: 'Бананы из Эквадора', price: 26000, oldPrice: 30000, unit: 'KG', step: 0.5, minQty: 0.5, stock: 80, lowStockThreshold: 10 },
      { nameUz: 'Uzum Kishmish', nameRu: 'Виноград Кишмиш', descriptionUz: 'Urug\'siz shirin uzum', descriptionRu: 'Сладкий виноград без косточек', price: 32000, unit: 'KG', step: 0.5, minQty: 0.5, stock: 4, lowStockThreshold: 5 },
      { nameUz: 'Limon', nameRu: 'Лимон', descriptionUz: 'Yangi limon, dona', descriptionRu: 'Свежий лимон, штука', price: 4000, unit: 'PIECE', step: 1, minQty: 1, stock: 200, lowStockThreshold: 20 },
    ],
  },
  {
    nameUz: 'Sut mahsulotlari',
    nameRu: 'Молочные продукты',
    iconName: 'Milk',
    products: [
      { nameUz: 'Sut 3.2%', nameRu: 'Молоко 3,2%', descriptionUz: 'Pasterizatsiyalangan sut, 1 litr', descriptionRu: 'Пастеризованное молоко, 1 литр', price: 13000, unit: 'LITER', step: 1, minQty: 1, stock: 60, lowStockThreshold: 10 },
      { nameUz: 'Qatiq', nameRu: 'Катык', descriptionUz: 'Uy usulida tayyorlangan qatiq, 0.5 l', descriptionRu: 'Домашний катык, 0,5 л', price: 9000, unit: 'PIECE', step: 1, minQty: 1, stock: 40, lowStockThreshold: 8 },
      { nameUz: 'Pishloq Gollandskiy', nameRu: 'Сыр Голландский', descriptionUz: 'Qattiq pishloq, vazn bo\'yicha', descriptionRu: 'Твёрдый сыр, на развес', price: 120000, oldPrice: 135000, unit: 'KG', step: 0.25, minQty: 0.25, stock: 15, lowStockThreshold: 3 },
      { nameUz: 'Tvorog 9%', nameRu: 'Творог 9%', descriptionUz: 'Yangi tvorog, 400 g', descriptionRu: 'Свежий творог, 400 г', price: 22000, unit: 'PACK', step: 1, minQty: 1, stock: 25, lowStockThreshold: 5 },
    ],
  },
  {
    nameUz: 'Go\'sht',
    nameRu: 'Мясо',
    iconName: 'Beef',
    products: [
      { nameUz: 'Mol go\'shti (lahm)', nameRu: 'Говядина (мякоть)', descriptionUz: 'Suyaksiz yangi mol go\'shti', descriptionRu: 'Свежая говядина без кости', price: 115000, unit: 'KG', step: 0.5, minQty: 0.5, stock: 40, lowStockThreshold: 5 },
      { nameUz: 'Qo\'y go\'shti', nameRu: 'Баранина', descriptionUz: 'Yangi qo\'y go\'shti', descriptionRu: 'Свежая баранина', price: 125000, unit: 'KG', step: 0.5, minQty: 0.5, stock: 30, lowStockThreshold: 5 },
      { nameUz: 'Tovuq son', nameRu: 'Куриные бёдра', descriptionUz: 'Sovutilgan tovuq son', descriptionRu: 'Охлаждённые куриные бёдра', price: 38000, oldPrice: 42000, unit: 'KG', step: 0.5, minQty: 0.5, stock: 3, lowStockThreshold: 5 },
      { nameUz: 'Qiyma', nameRu: 'Фарш', descriptionUz: 'Mol go\'shtidan qiyma', descriptionRu: 'Говяжий фарш', price: 98000, unit: 'KG', step: 0.5, minQty: 0.5, stock: 20, lowStockThreshold: 4 },
    ],
  },
  {
    nameUz: 'Non va shirinliklar',
    nameRu: 'Хлеб и сладости',
    iconName: 'Croissant',
    products: [
      { nameUz: 'Tandir non', nameRu: 'Тандырная лепёшка', descriptionUz: 'Issiq tandir noni', descriptionRu: 'Горячая лепёшка из тандыра', price: 5000, unit: 'PIECE', step: 1, minQty: 1, stock: 100, lowStockThreshold: 15 },
      { nameUz: 'Shokolad plitka', nameRu: 'Шоколад плитка', descriptionUz: 'Sutli shokolad, 90 g', descriptionRu: 'Молочный шоколад, 90 г', price: 16000, oldPrice: 19000, unit: 'PIECE', step: 1, minQty: 1, stock: 70, lowStockThreshold: 10 },
      { nameUz: 'Pechenye assorti', nameRu: 'Печенье ассорти', descriptionUz: 'Karobkadagi pechenye, 1 kg', descriptionRu: 'Печенье в коробке, 1 кг', price: 54000, unit: 'BOX', step: 1, minQty: 1, stock: 12, lowStockThreshold: 3 },
      { nameUz: 'Konfet Assorti', nameRu: 'Конфеты ассорти', descriptionUz: 'Shokoladli konfetlar, vazn bo\'yicha', descriptionRu: 'Шоколадные конфеты, на развес', price: 85000, unit: 'KG', step: 0.5, minQty: 0.5, stock: 18, lowStockThreshold: 3 },
    ],
  },
  {
    nameUz: 'Ichimliklar',
    nameRu: 'Напитки',
    iconName: 'CupSoda',
    products: [
      { nameUz: 'Mineral suv 1.5 l', nameRu: 'Минеральная вода 1,5 л', descriptionUz: 'Gazsiz mineral suv', descriptionRu: 'Негазированная минеральная вода', price: 5000, unit: 'PIECE', step: 1, minQty: 1, stock: 150, lowStockThreshold: 20 },
      { nameUz: 'Olma sharbati 1 l', nameRu: 'Яблочный сок 1 л', descriptionUz: '100% tabiiy sharbat', descriptionRu: '100% натуральный сок', price: 17000, unit: 'PIECE', step: 1, minQty: 1, stock: 45, lowStockThreshold: 8 },
      { nameUz: 'Ko\'k choy', nameRu: 'Зелёный чай', descriptionUz: 'Barg choy, 100 g pachka', descriptionRu: 'Листовой чай, пачка 100 г', price: 14000, unit: 'PACK', step: 1, minQty: 1, stock: 60, lowStockThreshold: 10 },
      { nameUz: 'Gazli ichimlik 6x1.5 l', nameRu: 'Газированный напиток 6x1,5 л', descriptionUz: 'Karobkada 6 dona', descriptionRu: 'Упаковка 6 штук', price: 72000, oldPrice: 80000, unit: 'BOX', step: 1, minQty: 1, stock: 10, lowStockThreshold: 2 },
    ],
  },
];

export async function seedDemoData(prisma: PrismaClient, opts: { force?: boolean } = {}) {
  await prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  const existing = await prisma.category.count();
  if (existing > 0 && !opts.force) {
    return { skipped: true, reason: 'Kategoriyalar allaqachon mavjud' };
  }
  let products = 0;
  for (const [ci, c] of CATEGORIES.entries()) {
    const category = await prisma.category.create({
      data: { nameUz: c.nameUz, nameRu: c.nameRu, iconName: c.iconName, sortOrder: ci },
    });
    for (const [pi, p] of c.products.entries()) {
      const product = await prisma.product.create({
        data: { ...p, categoryId: category.id, sortOrder: pi },
      });
      await prisma.stockMovement.create({
        data: {
          productId: product.id,
          type: 'IN',
          qty: p.stock,
          stockAfter: p.stock,
          note: 'Boshlang\'ich qoldiq (seed)',
          actorLabel: 'seed',
        },
      });
      products++;
    }
  }
  return { skipped: false, categories: CATEGORIES.length, products };
}
