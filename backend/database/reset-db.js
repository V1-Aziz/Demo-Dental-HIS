// Drops and recreates the database named in .env, then runs schema.sql and
// the seed files in order. Usage (from backend/):
//
//   npm run db:reset              schema + reference data + demo data
//   npm run db:reset -- --no-demo schema + reference data only
//
// Uses the same DB_* variables as the API (see .env.example).
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const FILES = [
  'schema.sql',
  'seeds/01_reference_data.sql',
  'seeds/02_demo_data.sql',
];

function requireEnv(key) {
  const value = process.env[key];
  if (!value) {
    console.error(`Missing ${key}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return value;
}

// SQL Server's `GO` is a client-side batch separator, so split on it here.
function splitBatches(script) {
  return script
    .split(/^\s*GO\s*$/im)
    .map(batch => batch.trim())
    .filter(batch => batch.length > 0);
}

function connect(database) {
  return new sql.ConnectionPool({
    server: requireEnv('DB_SERVER'),
    port: parseInt(process.env.DB_PORT || '1433', 10),
    user: requireEnv('DB_USER'),
    password: requireEnv('DB_PASSWORD'),
    database,
    options: { encrypt: false, trustServerCertificate: true },
    // One connection, so session settings carry over between batches.
    pool: { min: 1, max: 1 },
    requestTimeout: 120000,
  }).connect();
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to reset a database while NODE_ENV=production.');
    process.exit(1);
  }

  const database = requireEnv('DB_DATABASE');
  if (!/^[A-Za-z0-9_]+$/.test(database)) {
    console.error(`DB_DATABASE must contain only letters, digits and underscores (got "${database}").`);
    process.exit(1);
  }

  const files = process.argv.includes('--no-demo')
    ? FILES.filter(f => !f.includes('demo'))
    : FILES;

  console.log(`Recreating database ${database} on ${process.env.DB_SERVER}...`);
  const master = await connect('master');
  await master.request().batch(`
    IF DB_ID('${database}') IS NOT NULL
    BEGIN
      ALTER DATABASE [${database}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
      DROP DATABASE [${database}];
    END;
    CREATE DATABASE [${database}];
  `);
  await master.close();

  const db = await connect(database);
  try {
    for (const file of files) {
      const batches = splitBatches(fs.readFileSync(path.join(__dirname, file), 'utf8'));
      for (let i = 0; i < batches.length; i++) {
        try {
          await db.request().batch(batches[i]);
        } catch (err) {
          console.error(`\n${file}, batch ${i + 1} of ${batches.length} failed:\n  ${err.message}`);
          console.error(`\n${batches[i].split('\n').slice(0, 12).join('\n')}\n...`);
          process.exitCode = 1;
          return;
        }
      }
      console.log(`  ${file} (${batches.length} batches)`);
    }
    console.log(`Done.${files.length === FILES.length ? ' Demo accounts use the password Demo@1234.' : ''}`);
  } finally {
    await db.close();
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
