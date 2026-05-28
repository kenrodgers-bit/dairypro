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
const app = express();
const PORT = process.env.PORT || 5000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../../client/dist');
const origins = (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map(s => s.trim());
const requiredEnv = ['MONGO_URI', 'JWT_SECRET'];

for (const name of requiredEnv) {
  if (!process.env[name]) {
    throw new Error(`${name} is required. Copy server/.env.example to server/.env and set a value.`);
  }
}

app.use(helmet());
app.use(cors({ origin: origins, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan('tiny'));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));
app.get('/health', (_, res) => res.json({ ok: true, name: 'DairyTrack Pro API' }));
app.use('/api', router);

if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/.*/, (_, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use(errorHandler);

mongoose.connect(process.env.MONGO_URI).then(() => {
  console.log('MongoDB connected');
  app.listen(PORT, () => console.log(`API running on ${PORT}`));
}).catch((err) => {
  console.error('MongoDB connection failed:', err.message);
  process.exit(1);
});
