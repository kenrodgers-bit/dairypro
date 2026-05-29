import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

let templates;
let submissions;
let cows;
let milkRecords;
let auditLogs;

function matchValue(actual, expected) {
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    if ('$in' in expected) return expected.$in.includes(actual);
    if ('$ne' in expected) return actual !== expected.$ne;
    if ('$gte' in expected && actual < expected.$gte) return false;
    if ('$lte' in expected && actual > expected.$lte) return false;
    return String(actual) === String(expected);
  }
  return String(actual) === String(expected);
}

function matches(record, filter = {}) {
  return Object.entries(filter).every(([key, expected]) => matchValue(record[key], expected));
}

function documentFrom(record, collection) {
  const doc = {
    ...record,
    save: jest.fn(async function save() {
      const index = collection.findIndex((item) => item._id === this._id);
      if (index >= 0) collection[index] = this;
      return this;
    }),
    toObject() {
      const { save, toObject, ...data } = this;
      return data;
    },
  };
  return doc;
}

function queryResult(value) {
  const query = {
    populate: jest.fn(() => query),
    select: jest.fn(() => query),
    sort: jest.fn(() => query),
    limit: jest.fn(() => query),
    setOptions: jest.fn(() => query),
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
    catch: (reject) => Promise.resolve(value).catch(reject),
  };
  return query;
}

function collectionModel(collectionRef, name) {
  return {
    find: jest.fn((filter = {}) => queryResult(collectionRef().filter((record) => matches(record, filter)).map((record) => documentFrom(record, collectionRef())))),
    findOne: jest.fn((filter = {}) => {
      const record = collectionRef().find((item) => matches(item, filter));
      return queryResult(record ? documentFrom(record, collectionRef()) : null);
    }),
    findById: jest.fn((id) => {
      const record = collectionRef().find((item) => String(item._id) === String(id));
      return queryResult(record ? documentFrom(record, collectionRef()) : null);
    }),
    findOneAndUpdate: jest.fn((filter = {}, update = {}, options = {}) => {
      const record = collectionRef().find((item) => matches(item, filter));
      if (!record) return Promise.resolve(null);
      if (update.$push) {
        for (const [key, value] of Object.entries(update.$push)) {
          record[key] ||= [];
          record[key].push(value);
        }
      } else {
        Object.assign(record, update);
      }
      return Promise.resolve(options.new ? documentFrom(record, collectionRef()) : record);
    }),
    countDocuments: jest.fn((filter = {}) => Promise.resolve(collectionRef().filter((record) => matches(record, filter)).length)),
    aggregate: jest.fn(() => {
      const counts = submissions.reduce((acc, submission) => {
        acc[submission.status] = (acc[submission.status] || 0) + 1;
        return acc;
      }, {});
      return Promise.resolve(Object.entries(counts).map(([status, count]) => ({ _id: status, count })));
    }),
    deleteOne: jest.fn((filter = {}) => {
      const index = collectionRef().findIndex((record) => matches(record, filter));
      if (index >= 0) collectionRef().splice(index, 1);
      return Promise.resolve({ deletedCount: index >= 0 ? 1 : 0 });
    }),
    create: jest.fn((body) => {
      const record = {
        _id: `${name.toLowerCase()}-${collectionRef().length + 1}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...body,
      };
      collectionRef().push(record);
      return Promise.resolve(documentFrom(record, collectionRef()));
    }),
    insertMany: jest.fn((rows = []) => {
      rows.forEach((row) => collectionRef().push({ _id: `${name.toLowerCase()}-${collectionRef().length + 1}`, ...row }));
      return Promise.resolve(rows);
    }),
  };
}

function resetState() {
  templates = [
    {
      _id: 'template1',
      farmId: 'farm1',
      name: 'Morning Milk Collection',
      category: 'milk',
      isActive: true,
      fields: [
        { fieldId: 'cowTagNumber', label: 'Cow tag number', type: 'text', required: true },
        { fieldId: 'sessionDate', label: 'Collection date', type: 'date', required: true },
        { fieldId: 'session', label: 'Session', type: 'select', required: true },
        { fieldId: 'yieldLitres', label: 'Milk yield', type: 'number', required: true, min: 0, max: 200 },
      ],
    },
  ];
  submissions = [];
  cows = [{ _id: 'cow1', farm: 'farm1', name: 'Bella', tagNumber: 'DTP-001' }];
  milkRecords = [];
  auditLogs = [];
}

resetState();

const models = {
  FormTemplate: collectionModel(() => templates, 'FormTemplate'),
  FormSubmission: collectionModel(() => submissions, 'FormSubmission'),
  Cow: collectionModel(() => cows, 'Cow'),
  MilkRecord: collectionModel(() => milkRecords, 'MilkRecord'),
  AuditLog: collectionModel(() => auditLogs, 'AuditLog'),
  User: {
    findOne: jest.fn(() => queryResult({ _id: 'owner1', name: 'Owner', role: 'owner', active: true })),
  },
  DailyReport: collectionModel(() => [], 'DailyReport'),
  Expense: collectionModel(() => [], 'Expense'),
  FeedConsumption: collectionModel(() => [], 'FeedConsumption'),
  FeedInventory: collectionModel(() => [], 'FeedInventory'),
  HealthRecord: collectionModel(() => [], 'HealthRecord'),
  PregnancyRecord: collectionModel(() => [], 'PregnancyRecord'),
};

jest.unstable_mockModule('../src/models.js', () => models);
jest.unstable_mockModule('../src/middleware.js', () => ({
  auth: (req, _res, next) => {
    req.user = {
      _id: req.header('x-user-id') || 'owner1',
      farm: 'farm1',
      role: req.header('x-role') || 'owner',
    };
    next();
  },
  permit:
    (...roles) =>
    (req, res, next) =>
      roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Insufficient permissions' }),
  wrap: (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next),
}));

const { formTemplatesRouter } = await import('../src/formTemplatesRoutes.js');
const { formSubmissionsRouter } = await import('../src/formSubmissionsRoutes.js');
const { auditRouter } = await import('../src/auditRoutes.js');

const app = express();
app.use(express.json());
app.use('/api/form-templates', formTemplatesRouter);
app.use('/api/form-submissions', formSubmissionsRouter);
app.use('/api/audit-logs', auditRouter);
app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));

beforeEach(() => {
  jest.clearAllMocks();
  resetState();
});

describe('field forms HTTP workflow', () => {
  test('runs draft to submit to approve to transfer and records audit events', async () => {
    const draft = await request(app)
      .post('/api/form-submissions')
      .set('x-role', 'worker')
      .set('x-user-id', 'worker1')
      .send({
        templateId: 'template1',
        status: 'draft',
        farmData: { cowTagNumber: 'DTP-001', sessionDate: '2026-05-29', session: 'Morning', yieldLitres: '12.5' },
      })
      .expect(201);

    expect(draft.body.status).toBe('draft');

    const submitted = await request(app)
      .patch(`/api/form-submissions/${draft.body._id}/submit`)
      .set('x-role', 'worker')
      .set('x-user-id', 'worker1')
      .expect(200);
    expect(submitted.body.status).toBe('submitted');

    const approved = await request(app)
      .patch(`/api/form-submissions/${draft.body._id}/review`)
      .set('x-role', 'manager')
      .send({ action: 'approve', reviewNotes: 'Looks correct' })
      .expect(200);
    expect(approved.body.status).toBe('approved');

    const transferred = await request(app)
      .post(`/api/form-submissions/${draft.body._id}/transfer`)
      .set('x-role', 'manager')
      .expect(200);
    expect(transferred.body.status).toBe('transferred');
    expect(transferred.body.transferredCollection).toBe('MilkRecord');
    expect(milkRecords).toHaveLength(1);
    expect(milkRecords[0]).toEqual(expect.objectContaining({ cow: 'cow1', morningLitres: 12.5 }));

    const audit = await request(app)
      .get(`/api/audit-logs?entityType=FormSubmission&entityId=${draft.body._id}`)
      .set('x-role', 'manager')
      .expect(200);
    expect(audit.body.map((row) => row.action)).toContain('form.submission.transferred');
  });

  test('blocks invalid submitted forms and protects templates with active submissions', async () => {
    await request(app)
      .post('/api/form-submissions')
      .set('x-role', 'worker')
      .set('x-user-id', 'worker1')
      .send({ templateId: 'template1', status: 'submitted', farmData: { cowTagNumber: 'DTP-001' } })
      .expect(400);

    await request(app)
      .post('/api/form-submissions')
      .set('x-role', 'worker')
      .set('x-user-id', 'worker1')
      .send({
        templateId: 'template1',
        status: 'submitted',
        farmData: { cowTagNumber: 'DTP-001', sessionDate: '2026-05-29', session: 'Morning', yieldLitres: '12.5' },
      })
      .expect(201);

    await request(app)
      .put('/api/form-templates/template1')
      .set('x-role', 'manager')
      .send({ name: 'Edited', category: 'milk', fields: [] })
      .expect(409);
  });
});
