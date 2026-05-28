import { Cow, MilkRecord, HealthRecord, PregnancyRecord, Expense } from './models.js';
const daysAgo = (n) => new Date(Date.now() - n * 86400000);
const yearsBetween = (date) => date ? Math.floor((Date.now() - new Date(date).getTime()) / 31557600000) : null;
export async function calculateCowValueScore(cowId, farm) {
  const cow = await Cow.findOne({ _id: cowId, farm }); if (!cow) return null;
  let score = 0, penalties = 0; const breakdown = {}, strengths = [], risks = [];
  const since30 = daysAgo(30);
  const milk = await MilkRecord.find({ cow: cowId, farm, date: { $gte: since30 } });
  const total = milk.reduce((s,r)=>s+(r.morningLitres||0)+(r.afternoonLitres||0)+(r.eveningLitres||0),0);
  const avg = total / 30;
  let milkScore = milk.length ? (avg>=20?25:avg>=15?20:avg>=10?15:avg>=5?8:3) : 0;
  if (avg >= 15) strengths.push(`High milk production: ${avg.toFixed(1)}L/day`); if (!milk.length && cow.status==='milking') risks.push('No milk records in last 30 days');
  score += milkScore; breakdown.milk = { score: milkScore, max: 25, avgDailyMilk: Number(avg.toFixed(1)) };
  const age = yearsBetween(cow.dateOfBirth); let ageScore = 3;
  if (age !== null) { ageScore = age>=3&&age<=7?10:age>=2&&age<3?8:age>7&&age<=9?6:age>9?3:5; if(age>=3&&age<=7) strengths.push(`Prime age: ${age} years`); if(age>9) risks.push(`Older cow: ${age} years`); }
  score += ageScore; breakdown.age = { score: ageScore, max: 10, ageYears: age };
  const preg = await PregnancyRecord.find({ cow: cowId, farm }).sort({ inseminationDate: -1 }).limit(5); const latest = preg[0]; const failedCount = preg.filter(p=>p.pregnancyStatus==='failed_insemination').length; let pregScore = 4;
  if (latest?.pregnancyStatus === 'confirmed_pregnant') { pregScore = 15; strengths.push('Confirmed pregnant'); }
  else if (latest?.actualDeliveryDate && Date.now() - new Date(latest.actualDeliveryDate).getTime() <= 90*86400000) { pregScore = 12; strengths.push('Recently calved'); }
  else if (latest?.pregnancyStatus === 'not_pregnant') pregScore = 8;
  else if (latest?.pregnancyStatus === 'failed_insemination' || failedCount >= 2) { pregScore = 2; risks.push(`${failedCount} failed insemination(s)`); }
  score += pregScore; breakdown.pregnancy = { score: pregScore, max: 15, latestStatus: latest?.pregnancyStatus || 'unknown' };
  const sick = await HealthRecord.find({ cow: cowId, farm, recordType: 'sickness', dateSick: { $gte: daysAgo(183) } }); let healthScore = 15;
  if (cow.status==='sick') { healthScore=0; penalties += 10; risks.push('Currently sick'); }
  else if (!sick.length) strengths.push('No sickness in last 6 months');
  else if (sick.length===1) healthScore = sick[0].recoveryDate ? 10 : 6; else if (sick.length>=3) { healthScore=3; risks.push(`Repeated sickness: ${sick.length} episodes`); } else healthScore=6;
  score += healthScore; breakdown.health = { score: healthScore, max: 15, recentSickCount: sick.length };
  let breedScore = 3; const breed=(cow.breed||'').toLowerCase(); if(['friesian','ayrshire','jersey','guernsey','fleckvieh'].some(b=>breed.includes(b))) { breedScore=10; strengths.push(`High-demand breed: ${cow.breed}`); } else if(breed.includes('cross')) breedScore=8; else if(breed) breedScore=5;
  score += breedScore; breakdown.breed = { score: breedScore, max: 10, breed: cow.breed };
  const expenses = await Expense.find({ cow: cowId, farm, date: { $gte: daysAgo(30) } }); const exp = expenses.reduce((s,e)=>s+(e.amount||0),0); const income = total * 50; const profit = income - exp; let profitScore = profit>=10000?15:profit>=5000?10:profit>=1000?5:profit<0?0:3;
  if (profit >= 10000) strengths.push(`High monthly profit: KSh ${profit.toFixed(0)}`); if (profit < 0) risks.push(`Loss-making: KSh ${profit.toFixed(0)}`);
  score += profitScore; breakdown.profit = { score: profitScore, max: 15, monthlyProfit: Number(profit.toFixed(0)) };
  let calvingScore = 5; score += calvingScore; breakdown.calving = { score: calvingScore, max: 10 };
  if (cow.status==='milking' && !milk.length) penalties += 8; if (failedCount >= 2) penalties += 5; if (!cow.breed || !cow.tagNumber) penalties += 3;
  score = Math.max(0, Math.min(100, Math.round(score - penalties)));
  const category = score>=85?'Premium Cow':score>=70?'High-Value Cow':score>=55?'Average Cow':score>=40?'Risky Cow':'Low-Value Cow';
  const recommendedAction = score>=85?'Keep or sell at premium price':score>=70?'Keep and maintain care':score>=55?'Monitor and improve feeding':score>=40?'Review health and profitability':'Sell before value drops or call vet';
  return { cowId, score, category, recommendedAction, breakdown: { ...breakdown, penalties }, strengths, risks, calculatedAt: new Date() };
}
