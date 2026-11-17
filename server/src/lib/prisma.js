import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export async function logActivity(businessId, userId, action, entity = null, entityId = null) {
  try {
    await prisma.activityLog.create({ data: { businessId, userId, action, entity, entityId } });
  } catch (e) {
    console.error('activity log failed', e.message);
  }
}
