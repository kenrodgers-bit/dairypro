import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { router } from './routes.js';
import { errorHandler } from './middleware.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../../client/dist');
const origins = (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map((s) => s.trim());
const requiredEnv = ['MONGO_URI', 'JWT_SECRET'];

let mongoPromise;

export function assertRequiredEnv() {
  for (const name of requiredEnv) {
    if (!process.env[name]) {
      throw new Error(`${name} is required. Copy server/.env.example to server/.env and set a value.`);
    }
  }
}

export async function connectDatabase() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (!mongoPromise) {
    mongoPromise = mongoose.connect(process.env.MONGO_URI, {
      dbName: process.env.MONGO_DB_NAME || 'dairytrack_pro',
    });
  }

  return mongoPromise;
}

async function ensureDatabase(_, __, next) {
  try {
    await connectDatabase();
    next();
  } catch (error) {
    next(error);
  }
}

export const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: origins, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan('tiny'));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));
app.get('/health', (_, res) => res.json({ ok: true, name: 'DairyTrack Pro API' }));
app.use('/api', ensureDatabase, router);

if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/.*/, (_, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use(errorHandler);
