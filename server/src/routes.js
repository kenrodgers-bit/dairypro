import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import {
  Farm,
  User,
  Cow,
  MilkRecord,
  HealthRecord,
  PregnancyRecord,
  FeedItem,
  Expense,
  SaleRecord,
  Reminder,
  Vaccination,
  MilkQuality,
  FeedInventory,
  FeedConsumption,
  Task,
  FormSubmission,
  FormTemplate,
} from './models.js';
import { auth, permit, signToken, wrap } from './middleware.js';
import { calculateCowValueScore } from './cowValue.js';
import { dashboardCache, getDashboardCacheKey, invalidateDashboardCache } from './cache.js';
import { buildDefaultFormTemplates } from './defaultFormTemplates.js';

export const router = Router();

const managerRoles = ['owner', 'manager'];
const workerReadRoles = ['owner', 'manager', 'worker'];
const clean = (doc) => (doc?.toObject ? doc.toObject() : doc);
const totalMilk = (record) =>
  (record.morningLitres || 0) + (record.afternoonLitres || 0) + (record.eveningLitres || 0);
const farmFilter = (req) => ({ farm: req.user.farm });
const cowPopulate = 'name tagNumber breed status';
const isWorker = (req) => req.user.role === 'worker';
const csvEscape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;

function withHighRisk(record) {
  const data = clean(record);
  return data ? { ...data, highRisk: (data.scc || 0) > 200000 } : data;
}

function ownMilkFilter(req) {
  return isWorker(req) ? { createdBy: req.user._id } : {};
}

function buildFilter(req, extraFilter) {
  return { ...farmFilter(req), ...(extraFilter ? extraFilter(req) : {}) };
}

function applyPopulate(query, populate) {
  if (!populate) return query;
  return Array.isArray(populate)
    ? populate.reduce((nextQuery, item) => nextQuery.populate(item), query)
    : query.populate(populate);
}

function crud(path, Model, options = {}) {
  const readRoles = options.readRoles || managerRoles;
  const createRoles = options.createRoles || managerRoles;
  const updateRoles = options.updateRoles || managerRoles;
  const deleteRoles = options.deleteRoles || ['owner'];
  const populate = options.populate || { path: 'cow', select: cowPopulate };
  const mapRecord = options.mapRecord || ((record) => record);

  router.get(
    path,
    auth,
    permit(...readRoles),
    wrap(async (req, res) => {
      const query = Model.find(buildFilter(req, options.filter)).sort(options.sort || { createdAt: -1 });
      const records = await applyPopulate(query, populate);
      res.json(records.map(mapRecord));
    }),
  );

  if (!options.skipCreate) {
    router.post(
      path,
      auth,
      permit(...createRoles),
      wrap(async (req, res) => {
        const body = options.prepareCreate ? await options.prepareCreate(req) : req.body;
        const record = await Model.create({
          ...body,
          farm: req.user.farm,
          ...(options.stampCreatedBy ? { createdBy: req.user._id } : {}),
        });
        if (options.afterCreate) await options.afterCreate(record, req);
        res.status(201).json(mapRecord(record));
      }),
    );
  }

  router.get(
    `${path}/:id`,
    auth,
    permit(...readRoles),
    wrap(async (req, res) => {
      const query = Model.findOne({ _id: req.params.id, ...buildFilter(req, options.filter) });
      const record = await applyPopulate(query, populate);
      if (!record) return res.status(404).json({ message: 'Record not found' });
      res.json(mapRecord(record));
    }),
  );

  router.put(
    `${path}/:id`,
    auth,
    permit(...updateRoles),
    wrap(async (req, res) => {
      const body = options.prepareUpdate ? await options.prepareUpdate(req) : req.body;
      const record = await Model.findOneAndUpdate({ _id: req.params.id, ...buildFilter(req, options.filter) }, body, {
        new: true,
        runValidators: true,
      });
      if (!record) return res.status(404).json({ message: 'Record not found' });
      if (options.afterUpdate) await options.afterUpdate(record, req);
      res.json(mapRecord(record));
    }),
  );

  router.delete(
    `${path}/:id`,
    auth,
    permit(...deleteRoles),
    wrap(async (req, res) => {
      if (options.softDelete) {
        const record = await Model.findOneAndUpdate(
          { _id: req.params.id, farm: req.user.farm },
          { deletedAt: new Date() },
          { new: true, runValidators: true },
        );
        if (!record) return res.status(404).json({ message: 'Record not found' });
      } else {
        await Model.deleteOne({ _id: req.params.id, farm: req.user.farm });
      }
      if (options.afterDelete) await options.afterDelete(req);
      res.json({ ok: true });
    }),
  );
}

router.post(
  '/auth/register',
  wrap(async (req, res) => {
    const schema = z.object({
      name: z.string().min(2).max(200),
      email: z.string().email().max(200),
      password: z.string().min(8),
      farmName: z.string().min(2).max(200).optional(),
    });
    const body = schema.parse(req.body);
    const exists = await User.findOne({ email: body.email.toLowerCase() });
    if (exists) return res.status(409).json({ message: 'Email already exists' });

    const farm = await Farm.create({ name: body.farmName || `${body.name}'s Dairy Farm`, ownerName: body.name });
    const user = await User.create({
      name: body.name,
      email: body.email,
      passwordHash: await bcrypt.hash(body.password, 12),
      role: 'owner',
      farm: farm._id,
    });
    if (await FormTemplate.countDocuments({ farmId: farm._id }) === 0) {
      await FormTemplate.insertMany(buildDefaultFormTemplates({ farmId: farm._id, createdBy: user._id }));
    }

    res.status(201).json({
      token: signToken(user),
      user: { _id: user._id, name: user.name, email: user.email, role: user.role, farm: user.farm },
    });
  }),
);

router.post(
  '/auth/login',
  wrap(async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email: String(email || '').toLowerCase(), active: true });
    if (!user || !(await bcrypt.compare(password || '', user.passwordHash))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    res.json({
      token: signToken(user),
      user: { _id: user._id, name: user.name, email: user.email, role: user.role, farm: user.farm },
    });
  }),
);

router.get('/auth/me', auth, (req, res) => res.json(req.user));

router.get('/farm', auth, permit(...managerRoles), wrap(async (req, res) => res.json(await Farm.findById(req.user.farm))));
router.put('/farm', auth, permit('owner'), wrap(async (req, res) => res.json(await Farm.findByIdAndUpdate(req.user.farm, req.body, { new: true, runValidators: true }))));

router.get(
  '/cows/deleted',
  auth,
  permit('owner'),
  wrap(async (req, res) => {
    const cows = await Cow.find({ farm: req.user.farm, deletedAt: { $ne: null } })
      .setOptions({ withDeleted: true })
      .sort({ deletedAt: -1 });
    res.json(cows);
  }),
);

crud('/cows', Cow, {
  populate: null,
  softDelete: true,
});
crud('/milk', MilkRecord, {
  readRoles: workerReadRoles,
  createRoles: managerRoles,
  updateRoles: managerRoles,
  filter: ownMilkFilter,
  stampCreatedBy: true,
  afterCreate: (_, req) => invalidateDashboardCache(req.user.farm),
  afterUpdate: (_, req) => invalidateDashboardCache(req.user.farm),
  afterDelete: (req) => invalidateDashboardCache(req.user.farm),
});
crud('/health', HealthRecord, {
  readRoles: workerReadRoles,
});
crud('/pregnancy', PregnancyRecord, { skipCreate: true });
crud('/feed', FeedItem, { afterCreate: (_, req) => invalidateDashboardCache(req.user.farm) });
crud('/expenses', Expense, {
  afterCreate: (_, req) => invalidateDashboardCache(req.user.farm),
  afterUpdate: (_, req) => invalidateDashboardCache(req.user.farm),
  afterDelete: (req) => invalidateDashboardCache(req.user.farm),
});
crud('/sales', SaleRecord, {
  skipCreate: true,
  afterUpdate: (_, req) => invalidateDashboardCache(req.user.farm),
  afterDelete: (req) => invalidateDashboardCache(req.user.farm),
});
crud('/reminders', Reminder, {
  readRoles: workerReadRoles,
});

router.post(
  '/pregnancy',
  auth,
  permit(...managerRoles),
  wrap(async (req, res) => {
    const data = { ...req.body, farm: req.user.farm };
    if (data.inseminationDate) {
      data.expectedDeliveryDate = new Date(new Date(data.inseminationDate).getTime() + 283 * 86400000);
    }
    const record = await PregnancyRecord.create(data);
    if (data.pregnancyStatus === 'confirmed_pregnant') {
      await Cow.findOneAndUpdate({ _id: data.cow, farm: req.user.farm }, { status: 'pregnant' });
    }
    res.status(201).json(record);
  }),
);

router.post(
  '/sales',
  auth,
  permit(...managerRoles),
  wrap(async (req, res) => {
    const sale = await SaleRecord.create({ ...req.body, farm: req.user.farm });
    await Cow.findOneAndUpdate({ _id: sale.cow, farm: req.user.farm }, { status: 'sold' });
    invalidateDashboardCache(req.user.farm);
    res.status(201).json(sale);
  }),
);

router.get(
  '/cows/:id/value-score',
  auth,
  permit(...managerRoles),
  wrap(async (req, res) => res.json(await calculateCowValueScore(req.params.id, req.user.farm))),
);

router.get(
  '/dashboard/summary',
  auth,
  permit(...workerReadRoles),
  wrap(async (req, res) => {
    const cacheKey = getDashboardCacheKey(req);
    const cached = dashboardCache.get(cacheKey);
    res.setHeader('Cache-Control', 'max-age=600');
    if (cached) return res.json(cached);

    const farm = req.user.farm;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const todayStart = new Date(now.toDateString());
    const sevenDays = new Date(now.getTime() + 7 * 86400000);
    if (isWorker(req)) {
      const recentSubmissions = await FormSubmission.find({ farmId: farm, submittedBy: req.user._id }).sort({ createdAt: -1 }).limit(5);
      const draftForms = await FormSubmission.countDocuments({ farmId: farm, submittedBy: req.user._id, status: 'draft' });
      const payload = {
        stats: { totalCows: 0, milking: 0, pregnant: 0, sick: 0, sold: 0, todayMilk: 0, monthMilk: 0, milkIncome: 0, monthExpenses: 0, profit: 0, lowFeed: 0 },
        topCows: [],
        lowFeed: [],
        reminders: [],
        recentSales: [],
        forms: { drafts: draftForms, pendingReview: 0, recentSubmissions },
      };
      dashboardCache.set(cacheKey, payload);
      return res.json(payload);
    }

    const [cows, milk, expenses, feed, sales, reminders, vaccinationsDue, highScc, lowInventory, overdueTasks, pendingReview, approvedForms, recentFormSubmissions] =
      await Promise.all([
        Cow.find({ farm }),
        MilkRecord.find({ farm, date: { $gte: monthStart } }).populate('cow', 'name'),
        Expense.find({ farm, date: { $gte: monthStart } }),
        FeedItem.find({ farm }),
        SaleRecord.find({ farm }),
        Reminder.find({ farm, status: { $ne: 'done' } }).limit(10),
        Vaccination.find({ farm, deletedAt: null, nextDueDate: { $gte: now, $lte: sevenDays } })
          .populate('cowId', cowPopulate)
          .sort({ nextDueDate: 1 })
          .limit(10),
        MilkQuality.find({ farm, scc: { $gt: 200000 } }).populate('cowId', cowPopulate).sort({ testDate: -1 }).limit(10),
        FeedInventory.find({ farm, $expr: { $lt: ['$stockKg', '$lowStockThresholdKg'] } }).sort({ stockKg: 1 }).limit(10),
        Task.find({ farm, dueDate: { $lt: now }, status: { $ne: 'complete' } }).populate('assignedTo', 'name role').limit(10),
        FormSubmission.countDocuments({ farmId: farm, status: 'submitted' }),
        FormSubmission.countDocuments({ farmId: farm, status: 'approved' }),
        FormSubmission.find({ farmId: farm, status: { $in: ['submitted', 'approved', 'rejected'] } }).populate('submittedBy', 'name role').sort({ createdAt: -1 }).limit(5),
      ]);

    const todayMilk = milk.filter((m) => new Date(m.date) >= todayStart).reduce((sum, m) => sum + totalMilk(m), 0);
    const monthMilk = milk.reduce((sum, m) => sum + totalMilk(m), 0);
    const monthExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const milkIncome = milk.reduce((sum, m) => sum + (m.milkSold || 0) * (m.pricePerLitre || 50), 0);
    const active = cows.filter((c) => !['sold', 'dead'].includes(c.status));
    const topCows = Object.values(
      milk.reduce((acc, m) => {
        const id = m.cow?._id;
        if (!id) return acc;
        acc[id] ||= { name: m.cow.name, litres: 0 };
        acc[id].litres += totalMilk(m);
        return acc;
      }, {}),
    )
      .sort((a, b) => b.litres - a.litres)
      .slice(0, 5);
    const lowFeed = feed.filter((f) => f.currentStock <= f.lowStockThreshold);

    const payload = {
      stats: {
        totalCows: active.length,
        milking: cows.filter((c) => c.status === 'milking').length,
        pregnant: cows.filter((c) => c.status === 'pregnant').length,
        sick: cows.filter((c) => c.status === 'sick').length,
        sold: cows.filter((c) => c.status === 'sold').length,
        todayMilk,
        monthMilk,
        milkIncome,
        monthExpenses,
        profit: milkIncome - monthExpenses,
        lowFeed: lowFeed.length + lowInventory.length,
        vaccinationsDue: vaccinationsDue.length,
        highScc: highScc.length,
        overdueTasks: overdueTasks.length,
        pendingReview,
        approvedForms,
      },
      topCows,
      lowFeed,
      reminders,
      recentSales: sales.slice(0, 5),
      vaccinationsDue,
      highScc: highScc.map(withHighRisk),
      lowInventory,
      overdueTasks,
      forms: { pendingReview, approvedForms, recentSubmissions: recentFormSubmissions },
    };

    dashboardCache.set(cacheKey, payload);
    res.json(payload);
  }),
);

router.get(
  '/vaccinations/due',
  auth,
  permit(...managerRoles),
  wrap(async (req, res) => {
    const now = new Date();
    const sevenDays = new Date(now.getTime() + 7 * 86400000);
    const records = await Vaccination.find({
      farm: req.user.farm,
      deletedAt: null,
      nextDueDate: { $gte: now, $lte: sevenDays },
      ...(req.query.cowId ? { cowId: req.query.cowId } : {}),
    })
      .populate('cowId', cowPopulate)
      .sort({ nextDueDate: 1 });
    res.json(records);
  }),
);
crud('/vaccinations', Vaccination, {
  populate: { path: 'cowId', select: cowPopulate },
  filter: (req) => ({ deletedAt: null, ...(req.query.cowId ? { cowId: req.query.cowId } : {}) }),
  softDelete: true,
  stampCreatedBy: true,
});

router.get(
  '/milk-quality',
  auth,
  permit(...managerRoles),
  wrap(async (req, res) => {
    const records = await MilkQuality.find({ farm: req.user.farm, ...(req.query.cowId ? { cowId: req.query.cowId } : {}) })
      .populate('cowId', cowPopulate)
      .sort({ testDate: -1 });
    res.json(records.map(withHighRisk));
  }),
);
router.post(
  '/milk-quality',
  auth,
  permit(...managerRoles),
  wrap(async (req, res) => res.status(201).json(withHighRisk(await MilkQuality.create({ ...req.body, farm: req.user.farm })))),
);
router.get(
  '/milk-quality/:id',
  auth,
  permit(...managerRoles),
  wrap(async (req, res) => {
    const record = await MilkQuality.findOne({ _id: req.params.id, farm: req.user.farm }).populate('cowId', cowPopulate);
    if (!record) return res.status(404).json({ message: 'Record not found' });
    res.json(withHighRisk(record));
  }),
);
router.put(
  '/milk-quality/:id',
  auth,
  permit(...managerRoles),
  wrap(async (req, res) => {
    const record = await MilkQuality.findOneAndUpdate({ _id: req.params.id, farm: req.user.farm }, req.body, {
      new: true,
      runValidators: true,
    });
    if (!record) return res.status(404).json({ message: 'Record not found' });
    res.json(withHighRisk(record));
  }),
);
router.delete(
  '/milk-quality/:id',
  auth,
  permit('owner'),
  wrap(async (req, res) => {
    await MilkQuality.deleteOne({ _id: req.params.id, farm: req.user.farm });
    res.json({ ok: true });
  }),
);

router.get(
  '/feed-inventory/low-stock',
  auth,
  permit(...managerRoles),
  wrap(async (req, res) => {
    const items = await FeedInventory.find({ farm: req.user.farm, $expr: { $lt: ['$stockKg', '$lowStockThresholdKg'] } }).sort({
      stockKg: 1,
    });
    res.json(items);
  }),
);
crud('/feed-inventory', FeedInventory, { populate: null, afterCreate: (_, req) => invalidateDashboardCache(req.user.farm) });
crud('/feed-consumption', FeedConsumption, {
  populate: [
    { path: 'feedId', select: 'feedType stockKg costPerKg' },
    { path: 'cowId', select: cowPopulate },
  ],
  stampCreatedBy: false,
  prepareCreate: async (req) => req.body,
  afterCreate: async (record, req) => {
    await FeedInventory.findOneAndUpdate(
      { _id: record.feedId, farm: req.user.farm },
      { $inc: { stockKg: -Math.max(0, record.quantityKg || 0) } },
      { runValidators: true },
    );
    invalidateDashboardCache(req.user.farm);
  },
});

router.get(
  '/reports/pnl',
  auth,
  permit(...managerRoles),
  wrap(async (req, res) => {
    const from = req.query.from ? new Date(req.query.from) : new Date(new Date().getFullYear(), 0, 1);
    const to = req.query.to ? new Date(req.query.to) : new Date();
    to.setHours(23, 59, 59, 999);

    const [milk, expenses, healthRecords] = await Promise.all([
      MilkRecord.find({ farm: req.user.farm, date: { $gte: from, $lte: to } }),
      Expense.find({ farm: req.user.farm, date: { $gte: from, $lte: to } }),
      HealthRecord.find({ farm: req.user.farm, createdAt: { $gte: from, $lte: to } }),
    ]);

    const monthly = new Map();
    const ensureMonth = (date) => {
      const key = new Date(date).toISOString().slice(0, 7);
      if (!monthly.has(key)) monthly.set(key, { month: key, revenue: 0, feedCosts: 0, healthCosts: 0, otherExpenses: 0, costs: 0, profit: 0 });
      return monthly.get(key);
    };

    let totalMilkSalesRevenue = 0;
    let totalFeedCosts = 0;
    let totalHealthVetCosts = 0;
    let totalOtherExpenses = 0;

    milk.forEach((record) => {
      const revenue = (record.milkSold || 0) * (record.pricePerLitre || 50);
      totalMilkSalesRevenue += revenue;
      ensureMonth(record.date).revenue += revenue;
    });

    expenses.forEach((expense) => {
      const category = String(expense.category || '').toLowerCase();
      const row = ensureMonth(expense.date);
      if (category.includes('feed')) {
        totalFeedCosts += expense.amount || 0;
        row.feedCosts += expense.amount || 0;
      } else if (category.includes('health') || category.includes('vet') || category.includes('medicine')) {
        totalHealthVetCosts += expense.amount || 0;
        row.healthCosts += expense.amount || 0;
      } else {
        totalOtherExpenses += expense.amount || 0;
        row.otherExpenses += expense.amount || 0;
      }
    });

    healthRecords.forEach((record) => {
      const cost = record.treatmentCost || 0;
      if (!cost) return;
      totalHealthVetCosts += cost;
      ensureMonth(record.createdAt).healthCosts += cost;
    });

    const breakdown = Array.from(monthly.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((row) => {
        const costs = row.feedCosts + row.healthCosts + row.otherExpenses;
        const profit = row.revenue - costs;
        return { ...row, costs, profit };
      });
    let cumulativeProfit = 0;
    const monthlyBreakdown = breakdown.map((row) => {
      cumulativeProfit += row.profit;
      return { ...row, cumulativeProfit };
    });
    const totalCosts = totalFeedCosts + totalHealthVetCosts + totalOtherExpenses;
    const netProfit = totalMilkSalesRevenue - totalCosts;

    res.json({
      totalMilkSalesRevenue,
      totalFeedCosts,
      totalHealthVetCosts,
      totalOtherExpenses,
      grossProfit: totalMilkSalesRevenue - totalFeedCosts,
      netProfit,
      profitMargin: totalMilkSalesRevenue ? (netProfit / totalMilkSalesRevenue) * 100 : 0,
      monthlyBreakdown,
    });
  }),
);

router.get(
  '/reports/export/:type',
  auth,
  permit(...managerRoles),
  wrap(async (req, res) => {
    const { type } = req.params;
    const cows = await Cow.find(farmFilter(req));
    const rows = [['Name', 'Tag', 'Breed', 'Status'], ...cows.map((c) => [c.name, c.tagNumber, c.breed, c.status])];
    const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="dairytrack-${type}.csv"`);
    res.send(csv);
  }),
);

router.get(
  '/tasks',
  auth,
  permit(...workerReadRoles),
  wrap(async (req, res) => {
    const filter = isWorker(req) ? { assignedTo: req.user._id } : {};
    const tasks = await Task.find({ farm: req.user.farm, ...filter })
      .populate('assignedTo', 'name role')
      .populate('relatedCowId', cowPopulate)
      .sort({ dueDate: 1 });
    res.json(tasks);
  }),
);

router.get(
  '/tasks/overdue',
  auth,
  permit(...workerReadRoles),
  wrap(async (req, res) => {
    const filter = isWorker(req) ? { assignedTo: req.user._id } : {};
    const tasks = await Task.find({ farm: req.user.farm, dueDate: { $lt: new Date() }, status: { $ne: 'complete' }, ...filter })
      .populate('assignedTo', 'name role')
      .populate('relatedCowId', cowPopulate)
      .sort({ dueDate: 1 });
    res.json(tasks);
  }),
);

router.post(
  '/tasks',
  auth,
  permit(...managerRoles),
  wrap(async (req, res) => res.status(201).json(await Task.create({ ...req.body, farm: req.user.farm, assignedBy: req.user._id }))),
);

router.put(
  '/tasks/:id',
  auth,
  permit(...workerReadRoles),
  wrap(async (req, res) => {
    const filter = { _id: req.params.id, farm: req.user.farm };
    const body = isWorker(req)
      ? {
          status: req.body.status,
          ...(req.body.status === 'complete' ? { completedAt: new Date() } : {}),
        }
      : req.body;
    if (isWorker(req)) filter.assignedTo = req.user._id;

    const task = await Task.findOneAndUpdate(filter, body, { new: true, runValidators: true });
    if (!task) return res.status(404).json({ message: 'Record not found' });
    res.json(task);
  }),
);

router.delete(
  '/tasks/:id',
  auth,
  permit(...managerRoles),
  wrap(async (req, res) => {
    await Task.deleteOne({ _id: req.params.id, farm: req.user.farm });
    res.json({ ok: true });
  }),
);
