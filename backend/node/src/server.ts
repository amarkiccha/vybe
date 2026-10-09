import 'dotenv/config';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import helmet from 'helmet';
import cors from 'cors';
import { ZodError } from 'zod';
import { HttpError, env } from './lib.ts';
import { initStorage } from './storage.ts';
import auth from './routes/auth.ts';
import users, { reports } from './routes/users.ts';
import chats, { messages } from './routes/chats.ts';
import stories from './routes/stories.ts';
import communities from './routes/communities.ts';
import broadcast, { processScheduled } from './routes/broadcast.ts';
import media from './routes/media.ts';
import { seedDemo } from './seed.ts';

export const app = express();
app.set('trust proxy', true);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const api = express.Router();
api.get('/health', (_req, res) => { res.json({ ok: true, service: 'vybe-api', db: mongoose.connection.readyState === 1 }); });
api.get('/features', (_req, res) => {
  res.json({
    realtime: 'polling', e2ee: 'not_implemented', calls: 'pending', push: 'pending_fcm_config', otp: 'pending_provider',
    externalBroadcastProvider: 'not_configured', storage: 'emergent_object_storage',
  });
});
api.use('/auth', auth);
api.use('/users', users);
api.use('/reports', reports);
api.use('/conversations', chats);
api.use('/messages', messages);
api.use('/stories', stories);
api.use('/communities', communities);
api.use('/broadcast', broadcast);
api.use('/media', media);
app.use('/api', api);

app.use((_req, res) => { res.status(404).json({ error: 'not_found' }); });
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) return res.status(400).json({ error: 'validation_failed', issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.code, message: err.message !== err.code ? err.message : undefined });
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'file_too_large', message: 'Max 25 MB' });
  if (err?.code === 11000) return res.status(409).json({ error: 'duplicate' });
  if (err?.name === 'CastError') return res.status(400).json({ error: 'invalid_id' });
  console.error('[error]', err?.message ?? err);
  res.status(500).json({ error: 'internal_error' });
});

export async function start() {
  await mongoose.connect(env('MONGO_URL'), { dbName: env('DB_NAME') });
  await mongoose.connection.syncIndexes().catch((e) => console.error('[indexes]', e.message));
  initStorage();
  if (process.env.SEED_DEMO === 'true') await seedDemo().catch((e) => console.error('[seed]', e));
  setInterval(() => processScheduled().catch((e) => console.error('[scheduler]', e)), 30_000);
  const port = Number(env('NODE_API_PORT'));
  app.listen(port, '127.0.0.1', () => console.log(`VYBE API on ${port}`));
}

if (process.argv[1]?.endsWith('server.ts')) start();
