import ExcelJS from 'exceljs';
import { prisma } from '../db';
import { formatDateTime, formatQty, toNum, unitLabel } from '../lib/format';

export type ExportType = 'orders' | 'customers' | 'products' | 'stock';

const STATUS_UZ: Record<string, string> = {
  NEW: 'Yangi',
  ACCEPTED: 'Qabul qilindi',
  PREPARING: 'Tayyorlanmoqda',
  READY: 'Tayyor',
  ON_THE_WAY: "Yo'lda",
  DELIVERED: 'Yetkazildi',
  PICKED_UP: 'Topshirildi',
  CANCELLED: 'Bekor qilindi',
};

const fullName = (u: { firstName: string; lastName: string } | null) => (u ? `${u.firstName} ${u.lastName}`.trim() : '');

function styleSheet(ws: ExcelJS.Worksheet) {
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6F4E37' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
}

export async function buildExport(type: ExportType, range?: { start?: Date; end?: Date }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Shokoladchi';
  wb.created = new Date();

  if (type === 'orders') {
    const ws = wb.addWorksheet('Buyurtmalar');
    ws.columns = [
      { header: 'Raqam', key: 'number', width: 10 },
      { header: 'Sana', key: 'date', width: 18 },
      { header: 'Holat', key: 'status', width: 16 },
      { header: 'Turi', key: 'type', width: 16 },
      { header: 'Mijoz', key: 'customer', width: 24 },
      { header: 'Telefon', key: 'phone', width: 16 },
      { header: 'Manzil', key: 'address', width: 30 },
      { header: 'Tarkib', key: 'items', width: 60 },
      { header: 'Mahsulotlar', key: 'itemsTotal', width: 14 },
      { header: 'Yetkazish', key: 'deliveryFee', width: 12 },
      { header: 'Jami', key: 'finalTotal', width: 14 },
      { header: 'Sotuvchi', key: 'seller', width: 20 },
      { header: 'Kuryer', key: 'courier', width: 20 },
      { header: 'Bekor sababi', key: 'cancelReason', width: 24 },
    ];
    const orders = await prisma.order.findMany({
      where: range?.start || range?.end ? { createdAt: { gte: range.start, lt: range.end } } : {},
      include: { items: true, customer: true, seller: true, courier: true },
      orderBy: { createdAt: 'desc' },
    });
    for (const o of orders) {
      ws.addRow({
        number: o.number,
        date: formatDateTime(o.createdAt),
        status: STATUS_UZ[o.status],
        type: o.deliveryType === 'PICKUP' ? 'Olib ketish' : 'Yetkazib berish',
        customer: fullName(o.customer),
        phone: o.phone,
        address: o.address,
        items: o.items.map((i) => `${i.nameSnapshot} ${formatQty(i.finalQty ?? i.qty)} ${unitLabel(i.unit)}`).join('; '),
        itemsTotal: o.itemsTotal,
        deliveryFee: o.deliveryFee,
        finalTotal: o.finalTotal,
        seller: fullName(o.seller),
        courier: fullName(o.courier),
        cancelReason: o.cancelReason || '',
      });
    }
    ['itemsTotal', 'deliveryFee', 'finalTotal'].forEach((k) => (ws.getColumn(k).numFmt = '#,##0'));
    styleSheet(ws);
  }

  if (type === 'customers') {
    const ws = wb.addWorksheet('Mijozlar');
    ws.columns = [
      { header: 'ID', key: 'id', width: 8 },
      { header: 'Ism', key: 'name', width: 26 },
      { header: 'Telefon', key: 'phone', width: 16 },
      { header: 'Til', key: 'lang', width: 6 },
      { header: 'Buyurtmalar', key: 'orders', width: 12 },
      { header: 'Jami xarid', key: 'spent', width: 16 },
      { header: 'Oxirgi xarid', key: 'last', width: 18 },
      { header: 'Ro\'yxatdan o\'tgan', key: 'created', width: 18 },
      { header: 'Bloklangan', key: 'blocked', width: 10 },
    ];
    const users = await prisma.user.findMany({ where: { role: 'CUSTOMER' }, orderBy: { id: 'asc' } });
    const agg = await prisma.order.groupBy({
      by: ['customerId'],
      where: { status: { in: ['DELIVERED', 'PICKED_UP'] } },
      _count: { _all: true },
      _sum: { finalTotal: true },
      _max: { createdAt: true },
    });
    const map = new Map(agg.map((a) => [a.customerId, a]));
    for (const u of users) {
      const a = map.get(u.id);
      ws.addRow({
        id: u.id,
        name: fullName(u),
        phone: u.phone,
        lang: u.language,
        orders: a?._count._all || 0,
        spent: a?._sum.finalTotal || 0,
        last: formatDateTime(a?._max.createdAt),
        created: formatDateTime(u.createdAt),
        blocked: u.isBlocked ? 'Ha' : '',
      });
    }
    ws.getColumn('spent').numFmt = '#,##0';
    styleSheet(ws);
  }

  if (type === 'products' || type === 'stock') {
    const ws = wb.addWorksheet(type === 'products' ? 'Mahsulotlar' : 'Qoldiq');
    ws.columns = [
      { header: 'ID', key: 'id', width: 8 },
      { header: 'Nomi (uz)', key: 'nameUz', width: 30 },
      { header: 'Nomi (ru)', key: 'nameRu', width: 30 },
      { header: 'Kategoriya', key: 'category', width: 20 },
      { header: 'Narx', key: 'price', width: 12 },
      { header: 'Eski narx', key: 'oldPrice', width: 12 },
      { header: 'Birlik', key: 'unit', width: 10 },
      { header: 'Qoldiq', key: 'stock', width: 10 },
      { header: 'Chegara', key: 'threshold', width: 10 },
      { header: 'Qoldiq qiymati', key: 'value', width: 16 },
      { header: 'Holat', key: 'status', width: 12 },
    ];
    const products = await prisma.product.findMany({ include: { category: true }, orderBy: [{ categoryId: 'asc' }, { sortOrder: 'asc' }] });
    for (const p of products) {
      const stock = toNum(p.stock);
      const low = stock <= toNum(p.lowStockThreshold);
      const row = ws.addRow({
        id: p.id,
        nameUz: p.nameUz,
        nameRu: p.nameRu,
        category: p.category.nameUz,
        price: p.price,
        oldPrice: p.oldPrice || '',
        unit: unitLabel(p.unit),
        stock,
        threshold: toNum(p.lowStockThreshold),
        value: Math.round(stock * p.price),
        status: !p.isActive ? 'Nofaol' : low ? 'Kam qolgan' : 'Faol',
      });
      if (low && p.isActive) row.getCell('stock').font = { color: { argb: 'FFC0392B' }, bold: true };
    }
    ['price', 'oldPrice', 'value'].forEach((k) => (ws.getColumn(k).numFmt = '#,##0'));
    styleSheet(ws);

    if (type === 'stock') {
      const ws2 = wb.addWorksheet('Harakatlar');
      ws2.columns = [
        { header: 'Sana', key: 'date', width: 18 },
        { header: 'Mahsulot', key: 'product', width: 30 },
        { header: 'Turi', key: 'type', width: 10 },
        { header: 'Miqdor', key: 'qty', width: 10 },
        { header: 'Keyin', key: 'after', width: 10 },
        { header: 'Izoh', key: 'note', width: 30 },
        { header: 'Kim', key: 'who', width: 20 },
      ];
      const mv = await prisma.stockMovement.findMany({
        include: { product: true },
        orderBy: { createdAt: 'desc' },
        take: 5000,
      });
      for (const m of mv) {
        ws2.addRow({
          date: formatDateTime(m.createdAt),
          product: m.product.nameUz,
          type: m.type,
          qty: toNum(m.qty),
          after: m.stockAfter == null ? '' : toNum(m.stockAfter),
          note: m.note,
          who: m.actorLabel || '',
        });
      }
      styleSheet(ws2);
    }
  }

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const stamp = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());
  return { buffer, filename: `${type}-${stamp}.xlsx` };
}
