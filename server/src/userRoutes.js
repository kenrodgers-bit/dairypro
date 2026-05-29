import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { User } from './models.js';
import { writeAuditLog } from './audit.js';
import { auth, permit, wrap } from './middleware.js';

export const userRouter = Router();

const managerRoles = ['owner', 'manager'];
const roles = ['owner', 'manager', 'worker', 'viewer'];

const userSchema = z.object({
  name: z.string().min(2).max(200),
  email: z.string().email().max(200),
  role: z.enum(roles).default('worker'),
  password: z.string().min(8).optional(),
  active: z.boolean().optional(),
});

function publicUser(user) {
  const data = user?.toObject ? user.toObject() : user;
  if (!data) return data;
  const { passwordHash, ...safe } = data;
  return safe;
}

userRouter.get(
  '/',
  auth,
  permit(...managerRoles),
  wrap(async (req, res) => {
    const users = await User.find({ farm: req.user.farm }).select('-passwordHash').sort({ role: 1, name: 1 });
    res.json(users);
  }),
);

userRouter.post(
  '/',
  auth,
  permit('owner'),
  wrap(async (req, res) => {
    const body = userSchema.extend({ password: z.string().min(8) }).parse(req.body);
    const exists = await User.findOne({ email: body.email.toLowerCase() });
    if (exists) return res.status(409).json({ error: 'Email already exists' });

    const user = await User.create({
      name: body.name,
      email: body.email.toLowerCase(),
      role: body.role,
      active: body.active ?? true,
      farm: req.user.farm,
      passwordHash: await bcrypt.hash(body.password, 12),
    });
    await writeAuditLog({
      user: req.user,
      action: 'user.created',
      entityType: 'User',
      entityId: user._id,
      summary: `Created user ${user.email}`,
      metadata: { role: user.role, active: user.active },
    });
    res.status(201).json(publicUser(user));
  }),
);

userRouter.put(
  '/:id',
  auth,
  permit('owner'),
  wrap(async (req, res) => {
    const body = userSchema.partial().parse(req.body);
    if (String(req.params.id) === String(req.user._id) && body.active === false) {
      return res.status(409).json({ error: 'You cannot deactivate your own account' });
    }

    const update = { ...body };
    if (body.email) update.email = body.email.toLowerCase();
    if (body.password) {
      update.passwordHash = await bcrypt.hash(body.password, 12);
      delete update.password;
    }

    const user = await User.findOneAndUpdate({ _id: req.params.id, farm: req.user.farm }, update, {
      new: true,
      runValidators: true,
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    await writeAuditLog({
      user: req.user,
      action: 'user.updated',
      entityType: 'User',
      entityId: user._id,
      summary: `Updated user ${user.email}`,
      metadata: { changedFields: Object.keys(update).filter((field) => field !== 'passwordHash') },
    });
    res.json(publicUser(user));
  }),
);

userRouter.patch(
  '/:id/toggle-active',
  auth,
  permit('owner'),
  wrap(async (req, res) => {
    if (String(req.params.id) === String(req.user._id)) {
      return res.status(409).json({ error: 'You cannot deactivate your own account' });
    }

    const user = await User.findOne({ _id: req.params.id, farm: req.user.farm });
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.active = !user.active;
    await user.save();

    await writeAuditLog({
      user: req.user,
      action: user.active ? 'user.activated' : 'user.deactivated',
      entityType: 'User',
      entityId: user._id,
      summary: `${user.active ? 'Activated' : 'Deactivated'} user ${user.email}`,
      metadata: { active: user.active },
    });
    res.json(publicUser(user));
  }),
);
