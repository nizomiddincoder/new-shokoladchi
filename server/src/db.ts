import { PrismaClient, Prisma } from '@prisma/client';

export const prisma = new PrismaClient({
  log: [{ emit: 'event', level: 'error' }],
});

export { Prisma };

// JSON javobda Decimal -> number, BigInt -> string
(Prisma.Decimal.prototype as unknown as { toJSON: () => number }).toJSON = function (this: Prisma.Decimal) {
  return this.toNumber();
};
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (this: bigint) {
  return this.toString();
};

export async function getSettings() {
  return prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}
