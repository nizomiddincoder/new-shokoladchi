import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { startOfDayTashkent } from '../lib/format';

const LOCAL = (col: string) => Prisma.raw(`("${col}" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tashkent')`);
const DAY_MS = 24 * 3600 * 1000;

export function resolveRange(preset: string | undefined, from?: string, to?: string) {
  const today = startOfDayTashkent();
  let start: Date;
  let end: Date = new Date(today.getTime() + DAY_MS);
  if (preset === 'custom' && from && to) {
    start = new Date(`${from}T00:00:00+05:00`);
    end = new Date(new Date(`${to}T00:00:00+05:00`).getTime() + DAY_MS);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
      start = today;
      end = new Date(today.getTime() + DAY_MS);
    }
  } else if (preset === '7d') start = new Date(today.getTime() - 6 * DAY_MS);
  else if (preset === '30d') start = new Date(today.getTime() - 29 * DAY_MS);
  else start = today;
  return { start, end };
}

const n = (v: unknown) => (v == null ? 0 : Number(v));

function dayKey(d: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export async function dashboardStats(start: Date, end: Date) {
  const completed = Prisma.sql`o.status IN ('DELIVERED','PICKED_UP')`;
  const [summary] = await prisma.$queryRaw<
    { orders: bigint; cancelled: bigint; completed: bigint; revenue: bigint | null; active_sum: bigint | null }[]
  >`
    SELECT COUNT(*)::bigint AS orders,
      COUNT(*) FILTER (WHERE o.status = 'CANCELLED')::bigint AS cancelled,
      COUNT(*) FILTER (WHERE ${completed})::bigint AS completed,
      COALESCE(SUM(o."finalTotal") FILTER (WHERE ${completed}), 0)::bigint AS revenue,
      COALESCE(SUM(o."finalTotal") FILTER (WHERE o.status <> 'CANCELLED'), 0)::bigint AS active_sum
    FROM "Order" o WHERE o."createdAt" >= ${start} AND o."createdAt" < ${end}`;

  const newCustomers = await prisma.user.count({
    where: { role: 'CUSTOMER', regStep: 'DONE', createdAt: { gte: start, lt: end } },
  });

  const daily = await prisma.$queryRaw<{ d: string; orders: bigint; revenue: bigint | null }[]>`
    SELECT to_char(${LOCAL('createdAt')}, 'YYYY-MM-DD') AS d,
      COUNT(*)::bigint AS orders,
      COALESCE(SUM(o."finalTotal") FILTER (WHERE ${completed}), 0)::bigint AS revenue
    FROM "Order" o WHERE o."createdAt" >= ${start} AND o."createdAt" < ${end}
    GROUP BY d ORDER BY d`;
  const dailyMap = new Map(daily.map((r) => [r.d, r]));
  const dailySeries: { date: string; orders: number; revenue: number }[] = [];
  for (let t = start.getTime(); t < end.getTime(); t += DAY_MS) {
    const key = dayKey(new Date(t));
    const r = dailyMap.get(key);
    dailySeries.push({ date: key, orders: n(r?.orders), revenue: n(r?.revenue) });
  }

  const hours = await prisma.$queryRaw<{ h: number; orders: bigint }[]>`
    SELECT EXTRACT(HOUR FROM ${LOCAL('createdAt')})::int AS h, COUNT(*)::bigint AS orders
    FROM "Order" o WHERE o."createdAt" >= ${start} AND o."createdAt" < ${end}
    GROUP BY h ORDER BY h`;
  const hourSeries = Array.from({ length: 24 }, (_, h) => ({ hour: h, orders: n(hours.find((x) => x.h === h)?.orders) }));

  // O'chirilgan mahsulotlar (productId NULL) nomi bo'yicha alohida guruhlanadi
  const topProducts = await prisma.$queryRaw<{ productId: number | null; name: string; unit: string; qty: unknown; revenue: bigint }[]>`
    SELECT i."productId" AS "productId", MAX(i."nameSnapshot") AS name, MAX(i.unit::text) AS unit,
      SUM(COALESCE(i."finalQty", i.qty)) AS qty, SUM(i."lineTotal")::bigint AS revenue
    FROM "OrderItem" i JOIN "Order" o ON o.id = i."orderId"
    WHERE ${completed} AND o."createdAt" >= ${start} AND o."createdAt" < ${end}
    GROUP BY i."productId", CASE WHEN i."productId" IS NULL THEN i."nameSnapshot" END ORDER BY revenue DESC LIMIT 10`;

  const sellers = await prisma.$queryRaw<
    { id: number; name: string; accepted: bigint; completed: bigint; revenue: bigint; avg_accept_min: number | null }[]
  >`
    SELECT u.id, TRIM(u."firstName" || ' ' || u."lastName") AS name,
      COUNT(*)::bigint AS accepted,
      COUNT(*) FILTER (WHERE ${completed})::bigint AS completed,
      COALESCE(SUM(o."finalTotal") FILTER (WHERE ${completed}), 0)::bigint AS revenue,
      AVG(EXTRACT(EPOCH FROM (o."acceptedAt" - o."createdAt")) / 60)::float AS avg_accept_min
    FROM "Order" o JOIN "User" u ON u.id = o."sellerId"
    WHERE o."createdAt" >= ${start} AND o."createdAt" < ${end}
    GROUP BY u.id ORDER BY accepted DESC`;

  const orders = n(summary?.orders);
  const completedCount = n(summary?.completed);
  const revenue = n(summary?.revenue);
  return {
    range: { start, end },
    revenue,
    orders,
    completed: completedCount,
    pipelineSum: n(summary?.active_sum),
    avgCheck: completedCount ? Math.round(revenue / completedCount) : 0,
    cancelled: n(summary?.cancelled),
    cancelledPercent: orders ? Math.round((n(summary?.cancelled) / orders) * 1000) / 10 : 0,
    newCustomers,
    daily: dailySeries,
    hours: hourSeries,
    topProducts: topProducts.map((p) => ({ ...p, qty: n(p.qty), revenue: n(p.revenue) })),
    sellers: sellers.map((s) => ({
      id: s.id,
      name: s.name,
      accepted: n(s.accepted),
      completed: n(s.completed),
      revenue: n(s.revenue),
      avgAcceptMin: s.avg_accept_min == null ? null : Math.round(s.avg_accept_min * 10) / 10,
    })),
  };
}
