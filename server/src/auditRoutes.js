import { Router } from 'express';
import { AuditLog } from './models.js';
import { auth, permit, wrap } from './middleware.js';

export const auditRouter = Router();

const managerRoles = ['owner', 'manager'];

auditRouter.get(
  '/',
  auth,
  permit(...managerRoles),
  wrap(async (req, res) => {
    const filter = { farm: req.user.farm };
    if (req.query.entityType) filter.entityType = req.query.entityType;
    if (req.query.entityId) filter.entityId = String(req.query.entityId);
    if (req.query.action) filter.action = req.query.action;

    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
    const logs = await AuditLog.find(filter)
      .populate('actor', 'name email role')
      .sort({ createdAt: -1 })
      .limit(limit);
    res.json(logs);
  }),
);
