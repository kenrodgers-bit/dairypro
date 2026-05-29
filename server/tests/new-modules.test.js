import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

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

function createMockModel(defaultFind = []) {
  return {
    find: jest.fn(() => queryResult(defaultFind)),
    findOne: jest.fn(() => queryResult({ _id: 'record1', farm: 'farm1' })),
    findById: jest.fn(() => queryResult({ _id: 'record1', farm: 'farm1' })),
    findByIdAndUpdate: jest.fn(() => Promise.resolve({ _id: 'record1', farm: 'farm1' })),
    findOneAndUpdate: jest.fn(() => Promise.resolve({ _id: 'record1', farm: 'farm1' })),
    updateMany: jest.fn(() => Promise.resolve({ modifiedCount: 1 })),
    deleteOne: jest.fn(() => Promise.resolve({ deletedCount: 1 })),
    create: jest.fn((body) => Promise.resolve({ _id: 'created1', ...body })),
  };
}

const models = {
  Farm: createMockModel(),
  User: createMockModel(),
  Cow: createMockModel([{ _id: 'cow1', name: 'Luna', tagNumber: 'DTP-001', breed: 'Friesian', status: 'milking' }]),
  MilkRecord: createMockModel([{ milkSold: 30, pricePerLitre: 50, date: new Date('2026-01-15') }]),
  HealthRecord: createMockModel([{ treatmentCost: 500, createdAt: new Date('2026-01-16') }]),
  PregnancyRecord: createMockModel(),
  FeedItem: createMockModel(),
  Expense: createMockModel([
    { amount: 300, category: 'feed', date: new Date('2026-01-20') },
    { amount: 200, category: 'other', date: new Date('2026-01-21') },
  ]),
  SaleRecord: createMockModel(),
  Reminder: createMockModel(),
  Vaccination: createMockModel([{ _id: 'vac1', cowId: 'cow1', vaccineType: 'FMD', dateGiven: new Date('2026-01-10') }]),
  MilkQuality: createMockModel([{ _id: 'mq1', cowId: 'cow1', testDate: new Date('2026-01-10'), scc: 250000 }]),
  FeedInventory: createMockModel([{ _id: 'feed1', feedType: 'Hay', stockKg: 20, lowStockThresholdKg: 50, costPerKg: 10 }]),
  FeedConsumption: createMockModel([{ _id: 'cons1', feedId: 'feed1', quantityKg: 5 }]),
  Task: createMockModel([{ _id: 'task1', title: 'Milk pen A', assignedTo: 'user1', dueDate: new Date('2026-01-10'), status: 'pending' }]),
  FormTemplate: createMockModel([{ _id: 'template1', name: 'Morning Milk Collection', category: 'milk', isActive: true, fields: [] }]),
  FormSubmission: createMockModel([{ _id: 'submission1', templateId: 'template1', templateName: 'Morning Milk Collection', category: 'milk', status: 'submitted' }]),
  DailyReport: createMockModel([{ _id: 'report1', reportDate: new Date('2026-01-10'), activitiesCompleted: 'Checked herd' }]),
  AuditLog: createMockModel([]),
};

models.FormTemplate.countDocuments = jest.fn(() => Promise.resolve(0));
models.FormTemplate.insertMany = jest.fn(() => Promise.resolve([]));
models.FormSubmission.countDocuments = jest.fn(() => Promise.resolve(0));
models.FormSubmission.aggregate = jest.fn(() => Promise.resolve([{ _id: 'submitted', count: 2 }]));

jest.unstable_mockModule('../src/models.js', () => models);
jest.unstable_mockModule('../src/middleware.js', () => ({
  auth: (req, _res, next) => {
    req.user = {
      _id: req.header('x-user-id') || 'user1',
      farm: 'farm1',
      role: req.header('x-role') || 'owner',
    };
    next();
  },
  permit:
    (...roles) =>
    (req, res, next) =>
      roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Insufficient permissions' }),
  signToken: jest.fn(() => 'token'),
  wrap: (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next),
}));

const { router } = await import('../src/routes.js');
const { formTemplatesRouter } = await import('../src/formTemplatesRoutes.js');
const { formSubmissionsRouter } = await import('../src/formSubmissionsRoutes.js');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', router);
  app.use((err, _req, res, _next) => res.status(500).json({ message: err.message }));
  return app;
}

const app = createApp();
const formsApp = express();
formsApp.use(express.json());
formsApp.use('/api/form-templates', formTemplatesRouter);
formsApp.use('/api/form-submissions', formSubmissionsRouter);
formsApp.use((err, _req, res, _next) => res.status(500).json({ message: err.message }));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('vaccination endpoints', () => {
  test('lists due vaccinations and protects writes by role', async () => {
    await request(app).get('/api/vaccinations/due').expect(200);
    await request(app).post('/api/vaccinations').set('x-role', 'worker').send({}).expect(403, {
      error: 'Insufficient permissions',
    });
  });

  test('creates, reads, updates, and soft deletes vaccination records', async () => {
    await request(app).get('/api/vaccinations').expect(200);
    await request(app).get('/api/vaccinations/vac1').expect(200);
    await request(app).post('/api/vaccinations').send({ cowId: 'cow1', vaccineType: 'FMD', dateGiven: '2026-01-10' }).expect(201);
    await request(app).put('/api/vaccinations/vac1').send({ vaccineType: 'Booster' }).expect(200);
    await request(app).delete('/api/vaccinations/vac1').expect(200, { ok: true });
    expect(models.Vaccination.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'vac1', farm: 'farm1' },
      expect.objectContaining({ deletedAt: expect.any(Date) }),
      expect.objectContaining({ new: true }),
    );
  });
});

describe('financial report endpoint', () => {
  test('returns P&L aggregates for owners and managers only', async () => {
    const response = await request(app).get('/api/reports/pnl?from=2026-01-01&to=2026-01-31').expect(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        totalMilkSalesRevenue: 1500,
        totalFeedCosts: 300,
        totalHealthVetCosts: 500,
        totalOtherExpenses: 200,
        netProfit: 500,
      }),
    );

    await request(app).get('/api/reports/pnl').set('x-role', 'worker').expect(403, { error: 'Insufficient permissions' });
  });
});

describe('milk quality endpoints', () => {
  test('adds highRisk to SCC responses and supports CRUD', async () => {
    const list = await request(app).get('/api/milk-quality').expect(200);
    expect(list.body[0].highRisk).toBe(true);

    await request(app).get('/api/milk-quality/mq1').expect(200);
    await request(app).post('/api/milk-quality').send({ cowId: 'cow1', testDate: '2026-01-10', scc: 210000 }).expect(201);
    await request(app).put('/api/milk-quality/mq1').send({ scc: 100000 }).expect(200);
    await request(app).delete('/api/milk-quality/mq1').expect(200, { ok: true });
  });
});

describe('feed inventory endpoints', () => {
  test('covers inventory, low stock, and consumption routes', async () => {
    await request(app).get('/api/feed-inventory').expect(200);
    await request(app).get('/api/feed-inventory/low-stock').expect(200);
    await request(app).post('/api/feed-inventory').send({ feedType: 'Hay', stockKg: 20, costPerKg: 10 }).expect(201);
    await request(app).put('/api/feed-inventory/feed1').send({ stockKg: 30 }).expect(200);
    await request(app).delete('/api/feed-inventory/feed1').expect(200, { ok: true });

    await request(app).get('/api/feed-consumption').expect(200);
    await request(app).post('/api/feed-consumption').send({ feedId: 'feed1', quantityKg: 5 }).expect(201);
  });
});

describe('task endpoints', () => {
  test('supports worker task reads and status updates', async () => {
    await request(app).get('/api/tasks').set('x-role', 'worker').expect(200);
    await request(app).get('/api/tasks/overdue').set('x-role', 'worker').expect(200);
    await request(app).put('/api/tasks/task1').set('x-role', 'worker').send({ status: 'complete', title: 'ignored' }).expect(200);
    expect(models.Task.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'task1', farm: 'farm1', assignedTo: 'user1' }),
      expect.objectContaining({ status: 'complete', completedAt: expect.any(Date) }),
      expect.objectContaining({ new: true }),
    );
  });

  test('protects task management for owners and managers', async () => {
    await request(app).post('/api/tasks').set('x-role', 'worker').send({}).expect(403, { error: 'Insufficient permissions' });
    await request(app).post('/api/tasks').send({ title: 'Feed calves', assignedTo: 'user1', dueDate: '2026-01-10' }).expect(201);
    await request(app).delete('/api/tasks/task1').set('x-role', 'manager').expect(200, { ok: true });
  });
});

describe('field form endpoints', () => {
  test('lists templates and protects template writes', async () => {
    await request(formsApp).get('/api/form-templates').set('x-role', 'worker').expect(200);
    await request(formsApp).post('/api/form-templates').set('x-role', 'worker').send({}).expect(403, {
      error: 'Insufficient permissions',
    });
  });

  test('creates submitted form submissions and validates stats access', async () => {
    models.FormTemplate.findOne.mockImplementationOnce(() =>
      queryResult({
        _id: 'template1',
        name: 'Morning Milk Collection',
        category: 'milk',
        fields: [{ fieldId: 'cowTagNumber', label: 'Cow tag number', type: 'text', required: true }],
      }),
    );
    await request(formsApp)
      .post('/api/form-submissions')
      .send({ templateId: 'template1', status: 'submitted', farmData: { cowTagNumber: 'DTP-001' } })
      .expect(201);

    const stats = await request(formsApp).get('/api/form-submissions/stats').expect(200);
    expect(stats.body.submitted).toBe(2);
    await request(formsApp).get('/api/form-submissions/stats').set('x-role', 'worker').expect(403, { error: 'Insufficient permissions' });
  });
});
