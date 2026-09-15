import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { getLocalStatus, projectRoot, cliEnv } from './local-environment.mjs';

export function databaseVerificationEnvironment(env = cliEnv) {
  const target = env.OPENMEMBERS_DATABASE_TEST_TARGET;
  if (target !== undefined && target !== 'e5') {
    throw new Error('db:verify only supports the e5 target. Unset OPENMEMBERS_DATABASE_TEST_TARGET or set it to e5; use db:test for pilot/recovery.');
  }
  return { ...env, OPENMEMBERS_DATABASE_TEST_TARGET: 'e5' };
}

async function verifyFirstAdmin(local, run) {
  const email = 'first-admin@example.test';
  const password = randomBytes(24).toString('base64url');
  run('scripts/create-admin.mjs', [email], { OPENMEMBERS_ADMIN_PASSWORD: password });
  const userClient = createClient(local.API_URL, local.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const admin = createClient(local.API_URL, local.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await userClient.auth.signInWithPassword({ email, password });
  assert.equal(error, null);
  const result = await userClient.from('profiles').select('role').eq('id', data.user.id).single();
  assert.equal(result.error, null);
  assert.equal(result.data.role, 'super_admin');
  const removed = await admin.auth.admin.deleteUser(data.user.id);
  assert.equal(removed.error, null);
}
async function snapshot(local) {
  const client = new pg.Client({ connectionString: local.DB_URL });
  await client.connect();
  try {
    const definitions = {};
    definitions.columns = (await client.query("select table_name,column_name,data_type,udt_name,is_nullable,column_default from information_schema.columns where table_schema='public' order by table_name,ordinal_position")).rows;
    definitions.constraints = (await client.query("select cl.relname,c.conname,pg_get_constraintdef(c.oid) as definition from pg_constraint c join pg_class cl on cl.oid=c.conrelid join pg_namespace n on n.oid=cl.relnamespace where n.nspname='public' order by cl.relname,c.conname")).rows;
    definitions.policies = (await client.query("select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname in ('public','storage') order by schemaname,tablename,policyname")).rows;
    definitions.functions = (await client.query("select n.nspname,p.proname,pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' or (n.nspname='public' and p.proname in ('can_access_course','can_access_lesson','compute_user_streak','get_user_id_by_email','admin_search_students','claim_webhook_event','finish_webhook_event','apply_payment_enrollment','mutate_payment_enrollment','apply_manual_enrollment')) order by n.nspname,p.proname")).rows;
    definitions.indexes = (await client.query("select tablename,indexname,indexdef from pg_indexes where schemaname='public' order by tablename,indexname")).rows;
    const counts = {};
    for (const table of ['profiles','courses','modules','lessons','access_levels','enrollments','lesson_attachments','drip_rules']) counts[table] = Number((await client.query(`select count(*) as count from public.${table}`)).rows[0].count);
    return { schemaHash: createHash('sha256').update(JSON.stringify(definitions)).digest('hex'), counts };
  } finally { await client.end(); }
}

function saveReproducibilityEvidence(results) {
  mkdirSync('.private/e2', { recursive: true });
  writeFileSync('.private/e2/reproducibility.json', JSON.stringify({ verifiedAt: new Date().toISOString(), installations: results }, null, 2) + '\n');
}

export async function verifyDatabase({
  env = cliEnv,
  getStatus = getLocalStatus,
  exec = execFileSync,
  verifyAdmin = verifyFirstAdmin,
  takeSnapshot = snapshot,
  readTests = () => readdirSync('tests/database'),
  saveEvidence = saveReproducibilityEvidence,
  log = console.log,
} = {}) {
  // Reject mixed local targets before services, filesystem access or any reset.
  const verificationEnv = databaseVerificationEnvironment(env);
  function run(script, args = [], extraEnv = {}) {
    exec(process.execPath, [script, ...args], {
      cwd: projectRoot,
      env: { ...verificationEnv, ...extraEnv, OPENMEMBERS_DATABASE_TEST_TARGET: 'e5' },
      stdio: 'inherit',
    });
  }

  getStatus(); // Preserve the socket/project guards before the first destructive local reset.
  const results = [];
  for (let iteration = 1; iteration <= 2; iteration++) {
    log(`Clean local initialization ${iteration}/2`);
    run('scripts/local-db.mjs', ['reset']);
    const local = getStatus();
    await verifyAdmin(local, run);
    run('scripts/seed-demo.mjs');
    run('scripts/seed-demo.mjs'); // Upserts are safe to repeat; no duplicate demo records.
    run('--test', readTests().filter(file => file.endsWith('.test.mjs')).map(file => `tests/database/${file}`));
    results.push(await takeSnapshot(local));
  }
  assert.deepEqual(results[1], results[0], 'Clean installations must have equivalent schema and seed state.');
  saveEvidence(results);
  log('Two clean installations passed with equivalent schema and fixture counts.');
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await verifyDatabase();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
