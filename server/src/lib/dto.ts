import type { Prisma, ProductImage } from '@prisma/client';
import { toNum } from './format';

export const PRODUCT_INCLUDE = {
  images: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
  category: { select: { id: true, nameUz: true, nameRu: true } },
} satisfies Prisma.ProductInclude;

export type ProductWithImages = Prisma.ProductGetPayload<{ include: typeof PRODUCT_INCLUDE }>;

export function imageDto(img: ProductImage) {
  const useAi = img.useAi && img.aiStatus === 'DONE' && !!img.aiUrl;
  return {
    id: img.id,
    url: useAi ? img.aiUrl! : img.originalUrl,
    thumbUrl: useAi ? img.aiThumb || img.aiUrl! : img.originalThumb,
    originalUrl: img.originalUrl,
    originalThumb: img.originalThumb,
    aiUrl: img.aiUrl,
    aiThumb: img.aiThumb,
    aiStatus: img.aiStatus,
    aiError: img.aiError,
    useAi: img.useAi,
  };
}

const NEW_DAYS = 14;

export function productDto(p: ProductWithImages, opts: { staff?: boolean } = {}) {
  const images = p.images.map(imageDto);
  const discountPercent = p.oldPrice && p.oldPrice > p.price ? Math.round(((p.oldPrice - p.price) / p.oldPrice) * 100) : 0;
  return {
    id: p.id,
    nameUz: p.nameUz,
    nameRu: p.nameRu,
    descriptionUz: p.descriptionUz,
    descriptionRu: p.descriptionRu,
    categoryId: p.categoryId,
    category: p.category,
    price: p.price,
    oldPrice: p.oldPrice,
    discountPercent,
    unit: p.unit,
    step: toNum(p.step),
    minQty: toNum(p.minQty),
    stock: toNum(p.stock),
    inStock: toNum(p.stock) >= toNum(p.minQty),
    lowStockThreshold: toNum(p.lowStockThreshold),
    isLow: toNum(p.stock) <= toNum(p.lowStockThreshold),
    isActive: p.isActive,
    isNew: Date.now() - p.createdAt.getTime() < NEW_DAYS * 24 * 3600 * 1000,
    sortOrder: p.sortOrder,
    soldCount: toNum(p.soldCount),
    image: images[0] || null,
    images: opts.staff ? images : images.map((i) => ({ id: i.id, url: i.url, thumbUrl: i.thumbUrl })),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
