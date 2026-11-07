// Buyurtma holatlari: umumiy ro'yxat, o'zbekcha nomlar, CSS klasslari
export const ORDER_STATUSES = ['new', 'preparing', 'delivering', 'completed', 'cancelled'];

export const STATUS_LABEL = {
  new: 'Yangi',
  preparing: 'Tayyorlanmoqda',
  delivering: 'Yetkazilmoqda',
  completed: 'Yakunlangan',
  cancelled: 'Bekor qilingan',
};

export const STATUS_BADGE = {
  new: 'badge badge-neutral',
  preparing: 'badge badge-warning',
  delivering: 'badge badge-info',
  completed: 'badge badge-success',
  cancelled: 'badge badge-danger',
};

export const DELIVERY_LABEL = { pickup: 'Olib ketish', delivery: 'Yetkazib berish' };

// Qoldiq holati (ombor): semantik ranglar
export function stockBadge(stock, minLevel = 0) {
  if (stock === null) return { cls: 'badge badge-neutral', label: 'Kuzatilmaydi' };
  if (stock === 0) return { cls: 'badge badge-danger', label: 'Tugagan' };
  if (stock <= minLevel) return { cls: 'badge badge-warning', label: 'Kam qoldiq' };
  return { cls: 'badge badge-success', label: 'Mavjud' };
}
