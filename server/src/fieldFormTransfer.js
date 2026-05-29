import {
  Cow,
  DailyReport,
  Expense,
  FeedConsumption,
  FeedInventory,
  HealthRecord,
  MilkRecord,
  PregnancyRecord,
} from './models.js';
import { invalidateDashboardCache } from './cache.js';

export class TransferError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const numberOrZero = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const dateOrNow = (value) => (value ? new Date(value) : new Date());
const asArrayText = (value) => (Array.isArray(value) ? value.join(', ') : String(value || ''));

async function findCowByTagOrName(farm, value, fieldName) {
  const lookup = String(value || '').trim();
  if (!lookup) throw new TransferError(`Cow lookup failed: ${fieldName} is required before transfer`, 404);

  const byTag = await Cow.findOne({ farm, tagNumber: lookup });
  if (byTag) return byTag;

  const byName = await Cow.findOne({ farm, name: lookup });
  if (byName) return byName;

  throw new TransferError(`Cow lookup failed: correct ${fieldName} so it matches an existing cow tag number or name`, 404);
}

/**
 * Transfers a milk form into MilkRecord.
 * farmData.cowTagNumber -> Cow lookup; sessionDate -> date; session -> morning/afternoon/evening field;
 * yieldLitres -> session litres; milkQuality, conductivity, mastitis, notes -> notes audit text.
 */
async function transferMilk(submission, user) {
  const data = submission.farmData || {};
  const cow = await findCowByTagOrName(user.farm, data.cowTagNumber, 'cowTagNumber');
  const session = String(data.session || '').toLowerCase();
  const litres = numberOrZero(data.yieldLitres);
  const milkPayload = {
    farm: user.farm,
    cow: cow._id,
    date: dateOrNow(data.sessionDate),
    morningLitres: session === 'morning' ? litres : 0,
    afternoonLitres: session === 'afternoon' ? litres : 0,
    eveningLitres: session === 'evening' ? litres : 0,
    notes: [data.notes, data.milkQuality && `Appearance: ${data.milkQuality}`, data.conductivity && `Conductivity: ${data.conductivity}`, data.mastitis ? 'Mastitis signs observed' : '']
      .filter(Boolean)
      .join(' | '),
    createdBy: submission.submittedBy,
  };
  return { record: await MilkRecord.create(milkPayload), collection: 'MilkRecord' };
}

/**
 * Transfers a health observation form into HealthRecord.
 * farmData.cowTagNumber -> Cow lookup; observationDate -> dateSick; symptoms/severity -> diagnosis;
 * treatment -> medicineGiven; vetCalled and notes -> notes.
 */
async function transferHealth(submission, user) {
  const data = submission.farmData || {};
  const cow = await findCowByTagOrName(user.farm, data.cowTagNumber, 'cowTagNumber');
  const record = await HealthRecord.create({
    farm: user.farm,
    cow: cow._id,
    recordType: 'sickness',
    dateSick: dateOrNow(data.observationDate),
    symptoms: asArrayText(data.symptoms),
    diagnosis: data.severity ? `${data.severity} health observation` : 'Health observation',
    medicineGiven: data.treatment,
    treatmentType: data.vetCalled ? 'Vet notified' : 'Worker observation',
    notes: [data.notes, data.temperature && `Temperature: ${data.temperature} C`].filter(Boolean).join(' | '),
  });
  return { record, collection: 'HealthRecord' };
}

/**
 * Transfers a feed distribution form into FeedConsumption.
 * farmData.feedType -> FeedInventory lookup; cowTagNumber -> optional Cow lookup;
 * distributionDate -> date; quantityKg -> quantityKg; stockKg is decremented on the matching inventory item.
 */
async function transferFeed(submission, user) {
  const data = submission.farmData || {};
  const feedType = String(data.feedType || '').trim();
  const feed = await FeedInventory.findOne({ farm: user.farm, feedType });
  if (!feed) throw new TransferError('Feed inventory lookup failed: correct feedType so it matches an existing feed item', 404);

  const cow = data.cowTagNumber ? await findCowByTagOrName(user.farm, data.cowTagNumber, 'cowTagNumber') : null;
  const quantityKg = numberOrZero(data.quantityKg);
  const record = await FeedConsumption.create({
    farm: user.farm,
    feedId: feed._id,
    cowId: cow?._id || null,
    date: dateOrNow(data.distributionDate),
    quantityKg,
    recordedBy: submission.submittedBy,
  });
  await FeedInventory.findOneAndUpdate({ _id: feed._id, farm: user.farm }, { $inc: { stockKg: -quantityKg } }, { runValidators: true });
  return { record, collection: 'FeedConsumption' };
}

/**
 * Transfers an expense form into Expense.
 * farmData.expenseDate -> date; category -> category; amount -> amount;
 * description/paidTo/receiptNumber/notes -> description; paymentMethod -> paymentMethod.
 */
async function transferExpense(submission, user) {
  const data = submission.farmData || {};
  const record = await Expense.create({
    farm: user.farm,
    date: dateOrNow(data.expenseDate),
    category: data.category || 'Other',
    amount: numberOrZero(data.amount),
    description: [data.description, data.paidTo && `Paid to: ${data.paidTo}`, data.receiptNumber && `Receipt: ${data.receiptNumber}`, data.notes]
      .filter(Boolean)
      .join(' | '),
    paymentMethod: data.paymentMethod,
  });
  return { record, collection: 'Expense' };
}

/**
 * Transfers a calving form into PregnancyRecord and optionally Cow.
 * farmData.motherTagNumber -> mother Cow lookup; calvingDate -> actualDeliveryDate; calfSex/calfCondition/calfTagNumber -> calf fields;
 * calfTagNumber also creates a calf Cow profile when present.
 */
async function transferCalving(submission, user) {
  const data = submission.farmData || {};
  const mother = await findCowByTagOrName(user.farm, data.motherTagNumber, 'motherTagNumber');
  const record = await PregnancyRecord.create({
    farm: user.farm,
    cow: mother._id,
    pregnancyStatus: 'delivered',
    actualDeliveryDate: dateOrNow(data.calvingDate),
    calfBorn: data.calfCondition !== 'Stillborn',
    calfTagNumber: data.calfTagNumber,
    calfGender: data.calfSex,
    calfStatus: data.calfCondition,
    complications: data.assistanceRequired ? 'Assistance required during birth' : '',
    notes: [data.notes, data.birthWeightKg && `Birth weight: ${data.birthWeightKg} kg`, data.placenta ? 'Placenta passed' : 'Placenta not confirmed']
      .filter(Boolean)
      .join(' | '),
  });

  if (data.calfTagNumber) {
    await Cow.create({
      farm: user.farm,
      name: `Calf ${data.calfTagNumber}`,
      tagNumber: data.calfTagNumber,
      gender: String(data.calfSex || '').toLowerCase(),
      status: 'calf',
      dateOfBirth: dateOrNow(data.calvingDate),
      motherCow: mother.tagNumber || mother.name,
      notes: `Created from field form submission ${submission._id}`,
    });
  }

  return { record, collection: 'PregnancyRecord' };
}

/**
 * Transfers a general daily report form into DailyReport.
 * farmData.reportDate -> reportDate; reportingWorker -> reportingWorker; activitiesCompleted -> activitiesCompleted;
 * animalsChecked/issuesObserved/weatherConditions/additionalNotes map to same-named DailyReport fields.
 */
async function transferGeneral(submission, user) {
  const data = submission.farmData || {};
  const record = await DailyReport.create({
    farmId: user.farm,
    reportDate: dateOrNow(data.reportDate),
    reportingWorker: data.reportingWorker,
    activitiesCompleted: data.activitiesCompleted || 'Daily report',
    animalsChecked: numberOrZero(data.animalsChecked),
    issuesObserved: data.issuesObserved,
    weatherConditions: data.weatherConditions,
    additionalNotes: data.additionalNotes,
    submissionId: submission._id,
    submittedBy: submission.submittedBy,
  });
  return { record, collection: 'DailyReport' };
}

const transferByCategory = {
  milk: transferMilk,
  health: transferHealth,
  feed: transferFeed,
  expense: transferExpense,
  calving: transferCalving,
  general: transferGeneral,
};

export async function transferSubmissionToCore(submission, user) {
  const transfer = transferByCategory[submission.category];
  if (!transfer) throw new TransferError(`No transfer mapping exists for ${submission.category} forms`, 400);

  const result = await transfer(submission, user);
  invalidateDashboardCache(user.farm);
  return result;
}
