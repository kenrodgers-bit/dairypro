import { AuditLog } from './models.js';

export async function writeAuditLog({ user, farm, action, entityType, entityId, summary, metadata = {} }) {
  const farmId = farm || user?.farm;
  if (!farmId || !action || !entityType || !entityId || !summary) return null;

  try {
    return await AuditLog.create({
      farm: farmId,
      actor: user?._id,
      action,
      entityType,
      entityId: String(entityId),
      summary,
      metadata,
    });
  } catch (error) {
    console.warn('Audit log write failed:', error.message);
    return null;
  }
}
