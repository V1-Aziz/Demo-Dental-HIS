import express from 'express';
import cors from 'cors';
import { env } from './config/env.config';
import { getPool } from './config/db.config';
import routes from './routes/index';
import { errorMiddleware } from './middleware/error.middleware';
import { deleteExpiredSessions } from './repositories/user-session.repository';

const app = express();

app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api', routes);

app.use(errorMiddleware);

// Purge User_Sessions rows that expired more than 7 days ago — runs hourly.
const CLEANUP_INTERVAL_MS = 60 * 60 * 1_000;
setInterval(() => {
  deleteExpiredSessions()
    .then(n => { if (n > 0) console.info(`[session-cleanup] Deleted ${n} expired session(s)`); })
    .catch(err => console.warn('[session-cleanup] Error:', err));
}, CLEANUP_INTERVAL_MS);

async function bootstrap(): Promise<void> {
  try {
    await getPool();
    console.log(`[DB] Connected to MSSQL — ${env.db.database}`);
    app.listen(env.port, () => {
      console.log(`[SERVER] Running on http://localhost:${env.port} (${env.nodeEnv})`);
    });
  } catch (err) {
    console.error('[BOOTSTRAP] Fatal error:', err);
    process.exit(1);
  }
}

bootstrap();
