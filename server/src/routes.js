import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Farm, User, Cow, MilkRecord, HealthRecord, PregnancyRecord, FeedItem, Expense, SaleRecord, Reminder } from './models.js';
import { auth, permit, signToken, wrap } from './middleware.js';
import { calculateCowValueScore } from './cowValue.js';
export const router = Router();

const clean = (doc) => doc?.toObject ? doc.toObject() : doc;
const totalMilk = r => (r.morningLitres||0)+(r.afternoonLitres||0)+(r.eveningLitres||0);
const farmFilter = req => ({ farm: req.user.farm });

router.post('/auth/register', wrap(async (req,res)=>{
  const schema = z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(8), farmName: z.string().min(2).optional() });
  const body = schema.parse(req.body);
  const exists = await User.findOne({ email: body.email.toLowerCase() }); if (exists) return res.status(409).json({ message: 'Email already exists' });
  const farm = await Farm.create({ name: body.farmName || `${body.name}'s Dairy Farm`, ownerName: body.name });
  const user = await User.create({ name: body.name, email: body.email, passwordHash: await bcrypt.hash(body.password, 12), role: 'owner', farm: farm._id });
  res.status(201).json({ token: signToken(user), user: { _id:user._id, name:user.name, email:user.email, role:user.role, farm:user.farm } });
}));
router.post('/auth/login', wrap(async(req,res)=>{
  const { email, password } = req.body; const user = await User.findOne({ email: String(email||'').toLowerCase(), active:true });
  if (!user || !(await bcrypt.compare(password||'', user.passwordHash))) return res.status(401).json({ message: 'Invalid credentials' });
  res.json({ token: signToken(user), user: { _id:user._id, name:user.name, email:user.email, role:user.role, farm:user.farm } });
}));
router.get('/auth/me', auth, (req,res)=>res.json(req.user));

router.get('/farm', auth, wrap(async(req,res)=>res.json(await Farm.findById(req.user.farm))));
router.put('/farm', auth, permit('owner'), wrap(async(req,res)=>res.json(await Farm.findByIdAndUpdate(req.user.farm, req.body, { new:true }))));

function crud(path, Model, allowed=['owner','manager'], options={}) {
  router.get(path, auth, wrap(async(req,res)=>res.json(await Model.find(farmFilter(req)).sort({ createdAt:-1 }).populate('cow','name tagNumber breed status'))));
  if (!options.skipCreate) router.post(path, auth, permit(...allowed), wrap(async(req,res)=>res.status(201).json(await Model.create({ ...req.body, farm: req.user.farm }))));
  router.get(`${path}/:id`, auth, wrap(async(req,res)=>res.json(await Model.findOne({ _id:req.params.id, farm:req.user.farm }).populate('cow','name tagNumber breed status'))));
  router.put(`${path}/:id`, auth, permit(...allowed), wrap(async(req,res)=>res.json(await Model.findOneAndUpdate({ _id:req.params.id, farm:req.user.farm }, req.body, { new:true }))));
  router.delete(`${path}/:id`, auth, permit('owner'), wrap(async(req,res)=>{ await Model.deleteOne({ _id:req.params.id, farm:req.user.farm }); res.json({ ok:true }); }));
}
crud('/cows', Cow);
crud('/milk', MilkRecord, ['owner','manager','worker']);
crud('/health', HealthRecord);
crud('/pregnancy', PregnancyRecord, ['owner','manager'], { skipCreate: true });
crud('/feed', FeedItem);
crud('/expenses', Expense);
crud('/sales', SaleRecord, ['owner','manager'], { skipCreate: true });
crud('/reminders', Reminder);

router.post('/pregnancy', auth, permit('owner','manager'), wrap(async(req,res)=>{
  const data = { ...req.body, farm: req.user.farm };
  if (data.inseminationDate) data.expectedDeliveryDate = new Date(new Date(data.inseminationDate).getTime() + 283*86400000);
  const record = await PregnancyRecord.create(data);
  if (data.pregnancyStatus === 'confirmed_pregnant') await Cow.findOneAndUpdate({ _id:data.cow, farm:req.user.farm }, { status:'pregnant' });
  res.status(201).json(record);
}));

router.post('/sales', auth, permit('owner','manager'), wrap(async(req,res)=>{
  const sale = await SaleRecord.create({ ...req.body, farm:req.user.farm });
  await Cow.findOneAndUpdate({ _id:sale.cow, farm:req.user.farm }, { status:'sold' });
  res.status(201).json(sale);
}));

router.get('/cows/:id/value-score', auth, wrap(async(req,res)=>res.json(await calculateCowValueScore(req.params.id, req.user.farm))));
router.get('/dashboard/summary', auth, wrap(async(req,res)=>{
  const farm = req.user.farm; const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1); const todayStart = new Date(new Date().toDateString());
  const [cows, milk, expenses, feed, sales, reminders] = await Promise.all([
    Cow.find({ farm }), MilkRecord.find({ farm, date: { $gte: monthStart } }).populate('cow','name'), Expense.find({ farm, date: { $gte: monthStart } }), FeedItem.find({ farm }), SaleRecord.find({ farm }), Reminder.find({ farm, status: { $ne:'done' } }).limit(10)
  ]);
  const todayMilk = milk.filter(m=>new Date(m.date)>=todayStart).reduce((s,m)=>s+totalMilk(m),0); const monthMilk = milk.reduce((s,m)=>s+totalMilk(m),0); const monthExpenses = expenses.reduce((s,e)=>s+e.amount,0);
  const milkIncome = milk.reduce((s,m)=>s+(m.milkSold||0)*(m.pricePerLitre||50),0); const active = cows.filter(c=>!['sold','dead'].includes(c.status));
  const top = Object.values(milk.reduce((acc,m)=>{ const id=m.cow?._id; if(!id) return acc; acc[id] ||= { name:m.cow.name, litres:0 }; acc[id].litres += totalMilk(m); return acc; },{})).sort((a,b)=>b.litres-a.litres).slice(0,5);
  const lowFeed = feed.filter(f=>f.currentStock <= f.lowStockThreshold);
  res.json({ stats:{ totalCows:active.length, milking:cows.filter(c=>c.status==='milking').length, pregnant:cows.filter(c=>c.status==='pregnant').length, sick:cows.filter(c=>c.status==='sick').length, sold:cows.filter(c=>c.status==='sold').length, todayMilk, monthMilk, milkIncome, monthExpenses, profit:milkIncome-monthExpenses, lowFeed:lowFeed.length }, topCows:top, lowFeed, reminders, recentSales:sales.slice(0,5) });
}));
router.get('/reports/export/:type', auth, permit('owner','manager'), wrap(async(req,res)=>{
  const { type } = req.params;
  const cows = await Cow.find(farmFilter(req));
  const rows = [['Name','Tag','Breed','Status'], ...cows.map(c=>[c.name,c.tagNumber,c.breed,c.status])];
  const csv = rows.map(r=>r.map(x=>`\"${String(x??'').replaceAll('\"','\"\"')}\"`).join(',')).join('\n');
  res.setHeader('Content-Type','text/csv'); res.setHeader('Content-Disposition',`attachment; filename="dairytrack-${type}.csv"`); res.send(csv);
}));
