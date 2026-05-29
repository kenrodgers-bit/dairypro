import { Router } from 'express';
import { FormSubmission, FormTemplate, User } from './models.js';
import { auth, permit, wrap } from './middleware.js';

export const formTemplatesRouter = Router();

const managerRoles = ['owner', 'manager'];
const allowedCategories = ['milk', 'health', 'feed', 'expense', 'calving', 'vaccination', 'general'];
const allowedTypes = ['text', 'number', 'date', 'time', 'select', 'multiselect', 'boolean', 'photo', 'textarea'];

function sortFields(fields = []) {
  return [...fields].sort((a, b) => (a.order || 0) - (b.order || 0));
}

function validateUniqueFieldIds(fields = []) {
  const seen = new Set();
  for (const field of fields) {
    if (!field.fieldId) return 'Every field must have a fieldId';
    if (seen.has(field.fieldId)) return `Duplicate fieldId "${field.fieldId}" in template`;
    if (!allowedTypes.includes(field.type)) return `Unsupported field type "${field.type}"`;
    seen.add(field.fieldId);
  }
  return '';
}

async function addPrintFarmName(template) {
  const data = template?.toObject ? template.toObject() : template;
  if (!data) return data;
  const owner = await User.findOne({ farm: data.farmId, role: 'owner', active: true }).select('name');
  return { ...data, fields: sortFields(data.fields), farmName: owner?.name || 'My Farm' };
}

formTemplatesRouter.get(
  '/',
  auth,
  wrap(async (req, res) => {
    const filter = { farmId: req.user.farm };
    if (req.user.role === 'worker') filter.isActive = true;
    if (req.query.category) filter.category = req.query.category;

    const templates = await FormTemplate.find(filter).sort({ category: 1, name: 1 });
    res.json(templates.map((template) => {
      const data = template?.toObject ? template.toObject() : template;
      return { ...data, fields: sortFields(data.fields) };
    }));
  }),
);

formTemplatesRouter.post(
  '/',
  auth,
  permit(...managerRoles),
  wrap(async (req, res) => {
    if (!allowedCategories.includes(req.body.category)) return res.status(400).json({ error: 'Invalid template category' });
    const fieldError = validateUniqueFieldIds(req.body.fields || []);
    if (fieldError) return res.status(400).json({ error: fieldError });

    const template = await FormTemplate.create({
      ...req.body,
      farmId: req.user.farm,
      createdBy: req.user._id,
      fields: sortFields(req.body.fields || []),
    });
    res.status(201).json(template);
  }),
);

formTemplatesRouter.get(
  '/:id',
  auth,
  wrap(async (req, res) => {
    const filter = { _id: req.params.id, farmId: req.user.farm };
    if (req.user.role === 'worker') filter.isActive = true;
    const template = await FormTemplate.findOne(filter);
    if (!template) return res.status(404).json({ error: 'Form template not found' });
    res.json(await addPrintFarmName(template));
  }),
);

formTemplatesRouter.put(
  '/:id',
  auth,
  permit(...managerRoles),
  wrap(async (req, res) => {
    const protectedCount = await FormSubmission.countDocuments({
      templateId: req.params.id,
      farmId: req.user.farm,
      status: { $in: ['submitted', 'approved'] },
    });
    if (protectedCount) {
      return res.status(409).json({ error: 'Cannot edit a template while submitted or approved submissions reference it' });
    }

    const fieldError = validateUniqueFieldIds(req.body.fields || []);
    if (fieldError) return res.status(400).json({ error: fieldError });

    const template = await FormTemplate.findOneAndUpdate(
      { _id: req.params.id, farmId: req.user.farm },
      { ...req.body, fields: sortFields(req.body.fields || []) },
      { new: true, runValidators: true },
    );
    if (!template) return res.status(404).json({ error: 'Form template not found' });
    res.json(template);
  }),
);

formTemplatesRouter.patch(
  '/:id/toggle-active',
  auth,
  permit(...managerRoles),
  wrap(async (req, res) => {
    const template = await FormTemplate.findOne({ _id: req.params.id, farmId: req.user.farm });
    if (!template) return res.status(404).json({ error: 'Form template not found' });
    template.isActive = !template.isActive;
    await template.save();
    res.json(template);
  }),
);

formTemplatesRouter.post(
  '/:id/log-print',
  auth,
  permit(...managerRoles),
  wrap(async (req, res) => {
    const copies = Math.max(1, Math.min(50, Number(req.body.copies || 1)));
    const template = await FormTemplate.findOneAndUpdate(
      { _id: req.params.id, farmId: req.user.farm },
      {
        $push: {
          printHistory: {
            printedBy: req.user._id,
            printedAt: new Date(),
            copies,
            notes: req.body.notes,
          },
        },
      },
      { new: true },
    );
    if (!template) return res.status(404).json({ error: 'Form template not found' });
    res.status(201).json({ ok: true, printHistory: template.printHistory });
  }),
);

formTemplatesRouter.get(
  '/:id/print-history',
  auth,
  permit(...managerRoles),
  wrap(async (req, res) => {
    const template = await FormTemplate.findOne({ _id: req.params.id, farmId: req.user.farm }).populate('printHistory.printedBy', 'name role');
    if (!template) return res.status(404).json({ error: 'Form template not found' });
    res.json([...(template.printHistory || [])].sort((a, b) => new Date(b.printedAt) - new Date(a.printedAt)));
  }),
);

formTemplatesRouter.delete(
  '/:id',
  auth,
  permit('owner'),
  wrap(async (req, res) => {
    const count = await FormSubmission.countDocuments({ templateId: req.params.id, farmId: req.user.farm });
    if (count) return res.status(409).json({ error: 'Cannot delete a template with existing submissions', count });

    await FormTemplate.deleteOne({ _id: req.params.id, farmId: req.user.farm });
    res.json({ ok: true });
  }),
);
