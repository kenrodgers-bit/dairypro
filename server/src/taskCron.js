import cron from 'node-cron';
import { Task } from './models.js';

let started = false;

export function startTaskCron() {
  if (started) return;
  started = true;

  cron.schedule('0 0 * * *', async () => {
    await Task.updateMany(
      { dueDate: { $lt: new Date() }, status: { $nin: ['complete', 'overdue'] } },
      { $set: { status: 'overdue' } },
    );
  });
}
