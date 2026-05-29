import { Router } from 'express';
import { FormSubmission, FormTemplate } from './models.js';
import { auth, permit, wrap } from './middleware.js';
import { transferSubmissionToCore, TransferError } from './fieldFormTransfer.js';

export const formSubmissionsRouter = Router();

const managerRoles = ['owner', 'manager'];
const statuses = ['draft', 'submitted', 'approved', 'rejected', 'transferred'];
const isManager = (req) => managerRoles.includes(req.user.role);

function buildSubmissionFilter(req) {
  const filter = { farmId: req.user.farm };
  if (!isManager(req)) filter.submittedBy = req.user._id;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.templateId) filter.templateId = req.query.templateId;
  if (req.query.category) filter.category = req.query.category;
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) {
      const to = new Date(req.query.to);
      to.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = to;
    }
  }
  return filter;
}

function validateRequiredFields(template, farmData = {}) {
  const errors = [];
  for (const field of template.fields || []) {
    const value = farmData[field.fieldId];
    const isMissing =
      value === undefined ||
      value === null ||
      value === '' ||
      (Array.isArray(value) && value.length === 0);
    if (field.required && isMissing) errors.push(`${field.label || field.fieldId} is required`);

    if (!isMissing && field.type === 'number') {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        if (field.min !== undefined && numeric < field.min) errors.push(`${field.label || field.fieldId} must be at least ${field.min}`);
        if (field.max !== undefined && numeric > field.max) errors.push(`${field.label || field.fieldId} must be at most ${field.max}`);
      }
    }
  }
  return errors;
}

async function findTemplateForUser(req, templateId) {
  const filter = { _id: templateId, farmId: req.user.farm };
  if (req.user.role === 'worker') filter.isActive = true;
  return FormTemplate.findOne(filter);
}

async function loadSubmission(req, extra = {}) {
  const filter = { _id: req.params.id, farmId: req.user.farm, ...extra };
  if (!isManager(req)) filter.submittedBy = req.user._id;
  return FormSubmission.findOne(filter)
    .populate('templateId')
    .populate('submittedBy', 'name role')
    .populate('reviewedBy', 'name role')
    .populate('transferredBy', 'name role');
}

formSubmissionsRouter.get(
  '/stats',
  auth,
  permit(...managerRoles),
  wrap(async (req, res) => {
    const rows = await FormSubmission.aggregate([
      { $match: { farmId: req.user.farm } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const counts = Object.fromEntries(statuses.map((status) => [status, 0]));
    rows.forEach((row) => {
      counts[row._id] = row.count;
    });
    res.json(counts);
  }),
);

formSubmissionsRouter.get(
  '/',
  auth,
  wrap(async (req, res) => {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 100)));
    const sort = req.query.status === 'submitted' && isManager(req) ? { createdAt: 1 } : { createdAt: -1 };
    const submissions = await FormSubmission.find(buildSubmissionFilter(req))
      .populate('submittedBy', 'name role')
      .populate('reviewedBy', 'name role')
      .sort(sort)
      .limit(limit);
    res.json(submissions);
  }),
);

formSubmissionsRouter.post(
  '/',
  auth,
  wrap(async (req, res) => {
    const status = ['draft', 'submitted'].includes(req.body.status) ? req.body.status : 'draft';
    const template = await findTemplateForUser(req, req.body.templateId);
    if (!template) return res.status(404).json({ error: 'Form template not found' });

    if (status === 'submitted') {
      const validationErrors = validateRequiredFields(template, req.body.farmData || {});
      if (validationErrors.length) return res.status(400).json({ error: validationErrors.join('; ') });
    }

    const submission = await FormSubmission.create({
      templateId: template._id,
      templateName: template.name,
      category: template.category,
      submittedBy: req.user._id,
      farmId: req.user.farm,
      farmData: req.body.farmData || {},
      workerNotes: req.body.workerNotes,
      status,
      isOfflineDraft: Boolean(req.body.isOfflineDraft),
      isManualEntry: Boolean(req.body.isManualEntry),
      deviceInfo: req.body.deviceInfo || req.get('user-agent') || '',
    });

    res.status(201).json(submission);
  }),
);

formSubmissionsRouter.get(
  '/:id',
  auth,
  wrap(async (req, res) => {
    const submission = await loadSubmission(req);
    if (!submission) return res.status(404).json({ error: 'Form submission not found' });
    res.json(submission);
  }),
);

formSubmissionsRouter.patch(
  '/:id/submit',
  auth,
  wrap(async (req, res) => {
    const submission = await FormSubmission.findOne({ _id: req.params.id, farmId: req.user.farm, submittedBy: req.user._id, status: 'draft' });
    if (!submission) return res.status(404).json({ error: 'Draft submission not found' });

    const template = await FormTemplate.findOne({ _id: submission.templateId, farmId: req.user.farm });
    if (!template) return res.status(404).json({ error: 'Form template not found' });

    const validationErrors = validateRequiredFields(template, submission.farmData || {});
    if (validationErrors.length) return res.status(400).json({ error: validationErrors.join('; ') });

    submission.status = 'submitted';
    await submission.save();
    res.json(submission);
  }),
);

formSubmissionsRouter.patch(
  '/:id/review',
  auth,
  permit(...managerRoles),
  wrap(async (req, res) => {
    const submission = await FormSubmission.findOne({ _id: req.params.id, farmId: req.user.farm });
    if (!submission) return res.status(404).json({ error: 'Form submission not found' });

    if (!['approve', 'reject', 'reopen'].includes(req.body.action)) {
      return res.status(400).json({ error: 'Review action must be approve, reject, or reopen' });
    }
    if (req.body.action === 'approve' && submission.status !== 'submitted') {
      return res.status(409).json({ error: 'Only submitted forms can be approved' });
    }
    if (req.body.action === 'reject' && submission.status !== 'submitted') {
      return res.status(409).json({ error: 'Only submitted forms can be rejected' });
    }
    if (req.body.action === 'reopen' && submission.status !== 'rejected') {
      return res.status(409).json({ error: 'Only rejected forms can be re-opened for review' });
    }

    submission.status = req.body.action === 'approve' ? 'approved' : req.body.action === 'reject' ? 'rejected' : 'submitted';
    submission.reviewNotes = req.body.reviewNotes;
    submission.reviewedBy = req.user._id;
    submission.reviewedAt = new Date();
    await submission.save();
    res.json(submission);
  }),
);

formSubmissionsRouter.post(
  '/:id/transfer',
  auth,
  permit(...managerRoles),
  wrap(async (req, res) => {
    const submission = await FormSubmission.findOne({ _id: req.params.id, farmId: req.user.farm });
    if (!submission) return res.status(404).json({ error: 'Form submission not found' });
    if (submission.status !== 'approved') return res.status(409).json({ error: 'Only approved submissions can be transferred' });

    try {
      const { record, collection } = await transferSubmissionToCore(submission, req.user);
      submission.status = 'transferred';
      submission.transferredBy = req.user._id;
      submission.transferredAt = new Date();
      submission.transferredRecordId = String(record._id);
      submission.transferredCollection = collection;
      await submission.save();
      res.json(submission);
    } catch (error) {
      if (error instanceof TransferError) {
        return res.status(error.status).json({ error: error.message });
      }
      throw error;
    }
  }),
);

formSubmissionsRouter.delete(
  '/:id',
  auth,
  wrap(async (req, res) => {
    const submission = await FormSubmission.findOne({ _id: req.params.id, farmId: req.user.farm });
    if (!submission) return res.status(404).json({ error: 'Form submission not found' });

    const ownDraft = String(submission.submittedBy) === String(req.user._id) && submission.status === 'draft';
    const managerCanDelete = isManager(req) && ['draft', 'rejected'].includes(submission.status);
    if (!ownDraft && !managerCanDelete) {
      return res.status(409).json({ error: 'Only draft or rejected submissions can be deleted' });
    }

    await FormSubmission.deleteOne({ _id: submission._id });
    res.json({ ok: true });
  }),
);
