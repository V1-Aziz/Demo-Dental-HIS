import sql from 'mssql';
import { env } from './env.config';

const poolConfig: sql.config = {
  server: env.db.server,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  pool: {
    max: 10,
    min: 0,
    // Destroy idle connections after 60 s — well below most firewall/NAT idle
    // timeouts (typically 4–10 min). Prevents the pool from handing out a
    // "dead" TCP socket that looks alive but gets killed by the network,
    // which is what causes "Failed to cancel request in 5000ms".
    idleTimeoutMillis: 60000,
  },
  requestTimeout: 30000,
  connectionTimeout: 15000,
};

let pool: sql.ConnectionPool | null = null;

export async function getPool(): Promise<sql.ConnectionPool> {
  if (pool && pool.connected) return pool;
  pool = await sql.connect(poolConfig);
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.close();
    pool = null;
  }
}

// Matches connection-level failures where pool.connected may still be true
// but all underlying TCP connections are broken (e.g. after a SQL Server restart).
const CONNECTION_ERROR_PATTERNS = [
  'Failed to cancel request',
  'Connection lost',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEOUT',
  'socket hang up',
  'read ECONNRESET',
];

function isConnectionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return CONNECTION_ERROR_PATTERNS.some(p => msg.includes(p));
}

// Wraps a DB action with a single retry: on a connection-level error the pool
// is torn down so getPool() creates fresh connections, then the action runs again.
export async function withPool<T>(action: (p: sql.ConnectionPool) => Promise<T>): Promise<T> {
  try {
    return await action(await getPool());
  } catch (err) {
    if (isConnectionError(err)) {
      console.error('[DB] Connection error — resetting pool and retrying:', err instanceof Error ? err.message : err);
      if (pool) { try { await pool.close(); } catch { /* ignore */ } pool = null; }
      return await action(await getPool());
    }
    throw err;
  }
}
