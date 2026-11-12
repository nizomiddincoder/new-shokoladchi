import type { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { logger } from '../logger';
import type { Actor } from './auth';

function sanitize(v: unknown): Prisma.InputJsonValue | undefined {
  if (v === undefined || v === null) return undefined;
  return JSON.parse(
    JSON.stringify(v, (_k, val) => (typeof val === 'bigint' ? val.toString() : val)),
  ) as Prisma.InputJsonValue;
}

export async function audit(
  actor: Actor | { userId: number | null; label: string } | null,
  action: string,
  entity: string,
  entityId?: string | number | null,
  before?: unknown,
  after?: unknown,
) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: actor?.userId ?? null,
        actorLabel: actor?.label ?? 'system',
        action,
        entity,
        entityId: entityId == null ? null : String(entityId),
        before: sanitize(before),
        after: sanitize(after),
      },
    });
  } catch (err) {
    logger.warn({ err }, 'Audit log yozilmadi');
  }
}
