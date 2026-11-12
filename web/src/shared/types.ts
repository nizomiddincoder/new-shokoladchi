export type Lang = 'uz' | 'ru';
export type Role = 'CUSTOMER' | 'SELLER' | 'WAREHOUSE' | 'ADMIN';
export type Unit = 'PIECE' | 'KG' | 'GRAM' | 'LITER' | 'BOX' | 'PACK';
export type OrderStatus = 'NEW' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'ON_THE_WAY' | 'DELIVERED' | 'PICKED_UP' | 'CANCELLED';
export type DeliveryType = 'PICKUP' | 'DELIVERY';
export type AiStatus = 'NONE' | 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';

export type Me =
  | { kind: 'web'; role: 'ADMIN'; label: string; registered: true }
  | {
      kind: 'tg';
      registered: boolean;
      blocked?: boolean;
      id?: number;
      firstName?: string;
      lastName?: string;
      phone?: string | null;
      language?: Lang;
      role?: Role;
    };

export type Category = {
  id: number;
  nameUz: string;
  nameRu: string;
  iconName: string;
  imageUrl?: string | null;
  imageStatus?: AiStatus;
  sortOrder: number;
  isActive: boolean;
  _count?: { products: number };
};

export type ProductImage = {
  id: number;
  url: string;
  thumbUrl: string;
  originalUrl?: string;
  originalThumb?: string;
  aiUrl?: string | null;
  aiThumb?: string | null;
  aiStatus?: AiStatus;
  aiError?: string | null;
  useAi?: boolean;
};

export type Product = {
  id: number;
  nameUz: string;
  nameRu: string;
  descriptionUz: string;
  descriptionRu: string;
  categoryId: number;
  category?: { id: number; nameUz: string; nameRu: string };
  price: number;
  oldPrice: number | null;
  discountPercent: number;
  unit: Unit;
  step: number;
  minQty: number;
  stock: number;
  inStock: boolean;
  lowStockThreshold: number;
  isLow: boolean;
  isActive: boolean;
  isNew: boolean;
  sortOrder: number;
  soldCount: number;
  image: ProductImage | null;
  images: ProductImage[];
  createdAt: string;
  isFavorite?: boolean;
  similar?: Product[];
};

export type Banner = {
  id: number;
  imageUrl: string;
  titleUz: string;
  titleRu: string;
  linkType: 'NONE' | 'CATEGORY' | 'PRODUCT';
  linkId: number | null;
  sortOrder: number;
  isActive: boolean;
};

export type PublicSettings = {
  shopName: string;
  logoUrl: string | null;
  shopPhone: string;
  shopAddress: string;
  shopLat: number | null;
  shopLng: number | null;
  workHoursStart: string;
  workHoursEnd: string;
  deliveryFee: number;
  freeDeliveryFrom: number;
  minOrderAmount: number;
  isOpen: boolean;
};

export type Settings = Omit<PublicSettings, 'isOpen'> & { acceptTimeoutMinutes: number };

export type CartLine = { productId: number; qty: number; product: Product; lineTotal: number; available: boolean };
export type Cart = { items: CartLine[]; itemsTotal: number };

export type OrderItem = {
  id: number;
  /** Mahsulot o'chirilgan bo'lsa null */
  productId: number | null;
  nameUz: string;
  nameRu: string;
  unit: Unit;
  qty: number;
  finalQty: number | null;
  price: number;
  lineTotal: number;
  thumbUrl: string | null;
  designUrl?: string | null;
};

export type PersonalTemplate = {
  id: number;
  titleUz: string;
  titleRu: string;
  imageUrl: string;
  width: number;
  height: number;
  areaX: number;
  areaY: number;
  areaW: number;
  areaH: number;
  productId: number;
  sortOrder: number;
  isActive: boolean;
  product: Product;
};

export type PersonRef = { id?: number; firstName: string; lastName: string; phone: string | null; telegramId?: string; username?: string | null };

export type Order = {
  id: number;
  number: number;
  status: OrderStatus;
  deliveryType: DeliveryType;
  isPersonal?: boolean;
  address: string;
  lat: number | null;
  lng: number | null;
  comment: string;
  phone: string;
  itemsTotal: number;
  deliveryFee: number;
  finalTotal: number;
  initialTotal: number;
  readyPhotoUrl: string | null;
  cancelReason: string | null;
  cancelledBy: string | null;
  createdAt: string;
  acceptedAt: string | null;
  preparingAt: string | null;
  readyAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  sellerId: number | null;
  customerId: number;
  items: OrderItem[];
  customer?: PersonRef;
  seller?: PersonRef | null;
  history?: AuditEntry[];
};

export type AuditEntry = {
  id: number;
  userId: number | null;
  actorLabel: string;
  action: string;
  entity: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
};

export type StockMovement = {
  id: number;
  productId: number;
  type: 'IN' | 'OUT' | 'ORDER' | 'ADJUST' | 'RETURN';
  qty: number;
  stockAfter: number | null;
  note: string;
  actorLabel: string | null;
  createdAt: string;
  product: { id: number; nameUz: string; nameRu: string; unit: Unit };
};

export type Paged<T> = { items: T[]; total: number; page: number; pages: number };
