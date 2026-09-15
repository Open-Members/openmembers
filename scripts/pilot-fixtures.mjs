import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { provisionDemoData } from './demo-data.mjs';
import {
  assertLocalDockerSocket,
  getPilotRuntimeStatus,
  validatePilotStatus,
} from './local-pilot.mjs';

export async function requireEmptyPilot(db) {
  const { rows: tables } = await db.query(
    "select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') order by c.relname",
  );
  if (tables.length !== 47 || tables.some(({ relname }) => !/^[a-z][a-z0-9_]*$/u.test(relname))) {
    throw new Error('Pilot fixture provisioning requires the reviewed 47-table schema.');
  }
  const relations = ['auth.users', 'storage.objects', ...tables.map(({ relname }) => `public."${relname}"`)];
  for (const relation of relations) {
    const { rows } = await db.query(`select exists(select 1 from ${relation}) as occupied`);
    if (rows.length !== 1 || rows[0].occupied !== false) {
      throw new Error('Pilot already contains accounts, content or storage objects. No fixtures were written; no reset will be performed.');
    }
  }
}

export async function provisionEmptyPilot(db, provision) {
  // Hold this session lock through all API calls, so parallel invocations cannot seed twice.
  const { rows } = await db.query('select pg_try_advisory_lock(62701, 1) as acquired');
  if (rows[0]?.acquired !== true) throw new Error('Another pilot fixture operation is running.');
  try {
    await requireEmptyPilot(db);
    await provision();
  } finally {
    await db.query('select pg_advisory_unlock(62701, 1)');
  }
}

async function main() {
  assertLocalDockerSocket();
  const status = getPilotRuntimeStatus();
  validatePilotStatus(status);
  const db = new pg.Client({ connectionString: status.DB_URL });
  try {
    await db.connect();
    const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await provisionEmptyPilot(db, () => provisionDemoData(admin));
    console.log(JSON.stringify({ target: 'openmembers-e6-pilot', accounts: 6, courses: 2, lessons: 4, enrollments: 3, privateAttachments: 2 }));
  } finally {
    await db.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    // Avoid printing connection strings or API error payloads from the private environment.
    console.error(error.message.startsWith('Pilot ') || error.message.startsWith('Another pilot ')
      ? error.message : 'Pilot fixture provisioning failed. Inspect the isolated pilot before retrying; no reset was attempted.');
    process.exitCode = 1;
  });
}
