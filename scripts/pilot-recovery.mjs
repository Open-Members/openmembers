import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { assertLocalDockerSocket, getPilotRuntimeStatus, pilotCliEnvironment, pilotConfigTemplate, pilotRoot, projectRoot, sourceMigrations } from './local-pilot.mjs';
import { demoPassword, demoUsers, ids } from './demo-fixtures.mjs';
import { requireEmptyPilot } from './pilot-fixtures.mjs';

export const recoveryRoot = path.join(projectRoot, '.private/e6-recovery');
export const recoveryWorkdir = path.join(recoveryRoot, 'workdir');
export const recoveryProject = 'openmembers-e6-restore';
const backupRoot = path.join(recoveryRoot, 'backup');
const sourceContainer = 'supabase_db_openmembers-e6-pilot';
const targetContainer = 'supabase_db_openmembers-e6-restore';
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const sha = value => createHash('sha256').update(value).digest('hex');

export function safeRecoveryPath(file) {
  const absolute = path.resolve(file);
  let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep)) {
    current = path.join(current, part);
    let stat;
    try { stat = lstatSync(current); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    if (stat.isSymbolicLink()) throw new Error('Recovery paths must not contain symlinks.');
    if (current !== absolute && !stat.isDirectory()) throw new Error('Recovery ancestor must be a directory.');
  }
}
function directory(file) {
  safeRecoveryPath(file);
  mkdirSync(file, { recursive: true, mode: 0o700 });
  safeRecoveryPath(file);
}
function exclusive(file, bytes) {
  safeRecoveryPath(file);
  writeFileSync(file, bytes, { mode: 0o600, flag: 'wx' });
}
function bytes(file) {
  safeRecoveryPath(file);
  if (!lstatSync(file).isFile()) throw new Error('Recovery evidence must be a regular file.');
  return readFileSync(file);
}
export function recoveryConfig(source) {
  return source.replaceAll('openmembers-e6-pilot', recoveryProject)
    .replaceAll('56430', '57430').replaceAll('56431', '57431')
    .replaceAll('56432', '57432').replaceAll('56434', '57434').replaceAll('3201', '3301');
}
function expectedFiles() {
  const files = { 'config.toml': Buffer.from(recoveryConfig(bytes(pilotConfigTemplate).toString())) };
  for (const name of readdirSync(sourceMigrations).sort()) {
    if (!/^\d{14}_[a-z0-9_]+\.sql$/u.test(name)) throw new Error('Unexpected canonical migration.');
    files[`migrations/${name}`] = bytes(path.join(sourceMigrations, name));
  }
  if (Object.keys(files).length !== 11) throw new Error('Recovery requires the reviewed ten migrations.');
  return files;
}
function verifyLayout() {
  const expected = expectedFiles();
  for (const [relative, value] of Object.entries(expected)) {
    assert.equal(sha(bytes(path.join(recoveryWorkdir, 'supabase', relative))), sha(value), 'Recovery layout differs from canonical source.');
  }
  assert.deepEqual(readdirSync(path.join(recoveryWorkdir, 'supabase/migrations')).sort(), Object.keys(expected).filter(x => x.startsWith('migrations/')).map(x => x.slice(11)).sort());
  for (const relative of ['.temp/project-ref']) {
    const file = path.join(recoveryWorkdir, 'supabase', relative);
    safeRecoveryPath(file);
    try { lstatSync(file); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    throw new Error('Recovery workdir must not be linked.');
  }
  const branches = path.join(recoveryWorkdir, 'supabase/.branches');
  safeRecoveryPath(branches);
  try {
    assert.deepEqual(readdirSync(branches), ['_current_branch']);
    validateRecoveryBranch(bytes(path.join(branches, '_current_branch')).toString());
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
export function validateRecoveryBranch(value) {
  if (value.trim() !== 'main') throw new Error('Recovery requires the default local database branch.');
}
function command(executable, args, { input, timeout = 30_000 } = {}) {
  assertLocalDockerSocket();
  try {
    return execFileSync(executable, args, { cwd: projectRoot, env: pilotCliEnvironment(), timeout, maxBuffer: 64 * 1024 * 1024, input, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch { throw new Error('Isolated recovery command failed; private data was not printed.'); }
}
function cli(args, timeout) {
  verifyLayout();
  return command(process.execPath, ['node_modules/supabase/dist/supabase.js', '--workdir', recoveryWorkdir, ...args], { timeout });
}
export function validateRecoveryStatus(status) {
  const expected = { API_URL: ['http:', '127.0.0.1', '57431'], DB_URL: ['postgresql:', '127.0.0.1', '57432'], INBUCKET_URL: ['http:', '127.0.0.1', '57434'] };
  for (const [key, parts] of Object.entries(expected)) {
    let url;
    try { url = new URL(status[key]); } catch { throw new Error('Recovery status has an invalid destination.'); }
    if (url.protocol !== parts[0] || url.hostname !== parts[1] || url.port !== parts[2]
      || url.search || url.hash || url.pathname !== (key === 'DB_URL' ? '/postgres' : '/')) {
      throw new Error('Recovery status must use its exclusive loopback ports.');
    }
    if (key !== 'DB_URL' && (url.username || url.password)) throw new Error('Recovery HTTP origins must not include credentials.');
  }
  for (const key of ['ANON_KEY', 'SERVICE_ROLE_KEY']) {
    if (!/^[A-Za-z0-9._-]+$/u.test(status[key] ?? '')) throw new Error('Recovery status keys are unavailable.');
  }
  return status;
}
export function getRecoveryStatus() { return validateRecoveryStatus(JSON.parse(cli(['status', '--output', 'json']).toString())); }
async function connect(status) { const db = new pg.Client({ connectionString: status.DB_URL }); await db.connect(); return db; }
async function tableDigest(db) {
  const { rows } = await db.query("select schemaname, tablename from pg_tables where schemaname in ('public','auth') and tablename <> 'schema_migrations' order by schemaname, tablename");
  const result = [];
  for (const { schemaname, tablename } of rows) {
    if (!/^[a-z][a-z0-9_]*$/u.test(tablename)) throw new Error('Unexpected recovery table name.');
    const data = await db.query(`select to_jsonb(t) as value from "${schemaname}"."${tablename}" t`);
    result.push({ table: `${schemaname}.${tablename}`, count: data.rows.length, sha256: sha(data.rows.map(row => JSON.stringify(row.value)).sort().join('\n')) });
  }
  return result;
}
async function verifyDemoAccounts(db) {
  const { rows } = await db.query('select id, email from auth.users order by id');
  assert.deepEqual(rows, demoUsers.map(({ id, email }) => ({ id, email })), 'Recovery drill requires only the six known fictitious accounts.');
}
export function cacheControlSeconds(value = 'max-age=3600') {
  const match = String(value).match(/^(?:max-age=)?(\d+)$/u);
  if (!match) throw new Error('Unsupported Storage cache-control metadata in recovery drill.');
  return match[1];
}
export function validateDatabaseContainer(info, project, port) {
  assert.equal(info.name, `/supabase_db_${project}`);
  assert.match(info.id, /^[a-f0-9]{64}$/u);
  assert.equal(info.project, project);
  const bindings = info.ports?.['5432/tcp'];
  assert.ok(Array.isArray(bindings) && bindings.length > 0);
  assert.ok(bindings.every(binding => binding.HostPort === String(port)));
  return info.id;
}
function databaseContainer(container, project, port) {
  const format = '{"id":{{json .Id}},"name":{{json .Name}},"ports":{{json .NetworkSettings.Ports}},"project":{{json (index .Config.Labels "com.supabase.cli.project")}}}';
  const info = JSON.parse(command('docker', ['inspect', '--format', format, container]).toString());
  return validateDatabaseContainer(info, project, port);
}
function dump(args) { databaseContainer(sourceContainer, 'openmembers-e6-pilot', 56432); return command('docker', ['exec', sourceContainer, ...args]); }
async function backup() {
  const status = getPilotRuntimeStatus();
  const db = await connect(status);
  try {
    await verifyDemoAccounts(db);
    // Never overwrite an earlier backup, including a partial one.
    safeRecoveryPath(backupRoot);
    mkdirSync(backupRoot, { mode: 0o700 });
    const before = await tableDigest(db);
    const client = createClient(status.API_URL, status.SERVICE_ROLE_KEY, options);
    const { rows: objects } = await db.query('select bucket_id, name, owner_id, metadata from storage.objects order by bucket_id, name');
    const { rows: buckets } = await db.query('select id, name, public, file_size_limit, allowed_mime_types from storage.buckets order by id');
    directory(path.join(backupRoot, 'objects'));
    const storedObjects = [];
    for (const [index, object] of objects.entries()) {
      const downloaded = await client.storage.from(object.bucket_id).download(object.name);
      if (downloaded.error) throw new Error('Recovery storage download failed.');
      const value = Buffer.from(await downloaded.data.arrayBuffer());
      const file = `objects/${index}.bin`;
      exclusive(path.join(backupRoot, file), value);
      storedObjects.push({ ...object, file, sha256: sha(value), size: value.length });
    }
    const artifacts = {
      'roles.sql': dump(['pg_dumpall', '-U', 'postgres', '--roles-only']),
      'schema.sql': dump(['pg_dump', '-U', 'postgres', '-d', 'postgres', '--schema-only', '--schema=public', '--schema=auth', '--schema=storage', '--schema=private', '--schema=supabase_migrations']),
      'data.sql': dump(['pg_dump', '-U', 'postgres', '-d', 'postgres', '--data-only', '--schema=public', '--schema=auth', '--exclude-table=auth.schema_migrations']),
      'installation.json': bytes(path.join(pilotRoot, 'installation.json')),
      'application.env': bytes(path.join(pilotRoot, 'application.env')),
      'migration-manifest.json': bytes(path.join(pilotRoot, 'migration-manifest.json')),
    };
    for (const [file, value] of Object.entries(artifacts)) exclusive(path.join(backupRoot, file), value);
    assert.deepEqual(await tableDigest(db), before, 'Pilot changed during backup; preserve the partial backup for review.');
    assert.deepEqual((await db.query('select bucket_id, name, owner_id, metadata from storage.objects order by bucket_id, name')).rows, objects, 'Storage metadata changed during backup.');
    const { rows: migrations } = await db.query('select version from supabase_migrations.schema_migrations order by version');
    const imageId = command('docker', ['inspect', '--format', '{{.Image}}', 'openmembers-e6-pilot-app']).toString().trim();
    const manifest = { schemaVersion: 1, imageId, source: 'openmembers-e6-pilot', target: recoveryProject, tables: before, buckets, objects: storedObjects, migrations, files: Object.entries(artifacts).map(([file, value]) => ({ file, sha256: sha(value) })) };
    exclusive(path.join(backupRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    return { backedUp: true, tables: before.length, objects: objects.length, migrations: migrations.length };
  } finally { await db.end(); }
}
export function validateBackupManifest(manifest, read) {
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.source, 'openmembers-e6-pilot');
  assert.equal(manifest.target, recoveryProject);
  assert.ok(Array.isArray(manifest.files) && Array.isArray(manifest.objects));
  assert.ok(Array.isArray(manifest.tables) && Array.isArray(manifest.migrations) && Array.isArray(manifest.buckets));
  const expected = ['roles.sql', 'schema.sql', 'data.sql', 'installation.json', 'application.env', 'migration-manifest.json'].sort();
  assert.deepEqual(manifest.files.map(item => item.file).sort(), expected, 'Backup requires every canonical artifact exactly once.');
  const objectPaths = new Set();
  for (const [index, item] of manifest.objects.entries()) {
    assert.equal(item.file, `objects/${index}.bin`);
    assert.ok(typeof item.bucket_id === 'string' && /^[a-z][a-z0-9-]*$/u.test(item.bucket_id));
    assert.ok(typeof item.name === 'string' && /^[A-Za-z0-9_./ -]+$/u.test(item.name) && !item.name.split('/').some(part => !part || part === '.' || part === '..'));
    assert.ok(Number.isSafeInteger(item.size) && item.size >= 0);
    assert.ok(item.metadata && typeof item.metadata.mimetype === 'string' && /^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/u.test(item.metadata.mimetype));
    assert.equal(item.metadata.size, item.size);
    cacheControlSeconds(item.metadata.cacheControl);
    assert.ok(item.owner_id === null || (typeof item.owner_id === 'string' && /^[a-f0-9-]{36}$/u.test(item.owner_id)));
    const key = `${item.bucket_id}/${item.name}`;
    assert.ok(!objectPaths.has(key), 'Duplicate object in backup.');
    objectPaths.add(key);
  }
  // Validate the entire file index before reading any payload or connecting to the target.
  for (const item of [...manifest.files, ...manifest.objects]) assert.match(item.sha256, /^[a-f0-9]{64}$/u);
  for (const item of [...manifest.files, ...manifest.objects]) {
    assert.equal(sha(read(item.file)), item.sha256, 'Backup checksum mismatch.');
  }
  return manifest;
}
function loadBackup() {
  const manifest = JSON.parse(bytes(path.join(backupRoot, 'manifest.json')).toString());
  return validateBackupManifest(manifest, file => bytes(path.join(backupRoot, file)));
}
async function restore() {
  const manifest = loadBackup();
  const status = getRecoveryStatus();
  const db = await connect(status);
  try {
    await requireEmptyPilot(db);
    const { rows: migrations } = await db.query('select version from supabase_migrations.schema_migrations order by version');
    assert.deepEqual(migrations, manifest.migrations);
    const { rows: buckets } = await db.query('select id, name, public, file_size_limit, allowed_mime_types from storage.buckets order by id');
    assert.deepEqual(buckets, manifest.buckets, 'Canonical bucket configuration differs from backup.');
    const data = bytes(path.join(backupRoot, 'data.sql'));
    databaseContainer(targetContainer, recoveryProject, 57432);
    command('docker', ['exec', '-i', targetContainer, 'psql', '-U', 'postgres', '-d', 'postgres', '--single-transaction', '-v', 'ON_ERROR_STOP=1', '-c', 'SET session_replication_role = replica', '-f', '-'], { input: data });
    assert.deepEqual(await tableDigest(db), manifest.tables, 'Restored database differs from backup.');
    const client = createClient(status.API_URL, status.SERVICE_ROLE_KEY, options);
    for (const object of manifest.objects) {
      const result = await client.storage.from(object.bucket_id).upload(object.name, bytes(path.join(backupRoot, object.file)), { contentType: object.metadata?.mimetype ?? 'application/octet-stream', cacheControl: cacheControlSeconds(object.metadata?.cacheControl), upsert: false });
      if (result.error) throw new Error('Recovery storage upload failed.');
      await db.query('update storage.objects set owner_id=$1 where bucket_id=$2 and name=$3', [object.owner_id, object.bucket_id, object.name]);
    }
    return { restored: true, tables: manifest.tables.length, objects: manifest.objects.length };
  } finally { await db.end(); }
}
async function verify() {
  const manifest = loadBackup();
  const status = getRecoveryStatus();
  const db = await connect(status);
  try {
    assert.deepEqual(await tableDigest(db), manifest.tables, 'Database changed before restoration verification.');
    await verifyDemoAccounts(db);
    const { rows: rls } = await db.query("select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r' and relrowsecurity");
    assert.equal(rls.length, 47);
    const client = createClient(status.API_URL, status.SERVICE_ROLE_KEY, options);
    const { rows: restoredObjects } = await db.query('select bucket_id, name, owner_id, metadata from storage.objects order by bucket_id, name');
    assert.equal(restoredObjects.length, manifest.objects.length);
    for (const object of manifest.objects) {
      const restored = restoredObjects.find(item => item.bucket_id === object.bucket_id && item.name === object.name);
      assert.ok(restored, 'Restored object metadata is missing.');
      assert.equal(restored.owner_id, object.owner_id);
      assert.equal(restored.metadata.mimetype, object.metadata.mimetype);
      assert.equal(restored.metadata.size, object.size);
      assert.equal(cacheControlSeconds(restored.metadata.cacheControl), cacheControlSeconds(object.metadata.cacheControl));
      const result = await client.storage.from(object.bucket_id).download(object.name);
      if (result.error) throw new Error('Restored object download failed.');
      assert.equal(sha(Buffer.from(await result.data.arrayBuffer())), object.sha256);
    }
    for (const user of demoUsers) {
      const session = createClient(status.API_URL, status.ANON_KEY, options);
      const result = await session.auth.signInWithPassword({ email: user.email, password: demoPassword });
      assert.equal(result.error, null, 'Restored fictitious account could not sign in.');
      if (user.email === 'student@example.test' || user.email === 'visitor@example.test') {
        const access = await session.rpc('can_access_lesson', { p_lesson_id: ids.lesson });
        assert.equal(access.error, null);
        assert.equal(access.data, user.email === 'student@example.test');
      }
      await session.auth.signOut();
    }
    const source = await connect(getPilotRuntimeStatus());
    try { assert.deepEqual(await tableDigest(source), manifest.tables, 'Source changed since backup.'); } finally { await source.end(); }
    const receipt = { verified: true, accounts: 6, tables: manifest.tables.length, rlsTables: rls.length, objects: manifest.objects.length, migrations: manifest.migrations.length, sourceTablesUnchanged: true };
    exclusive(path.join(recoveryRoot, 'verification.json'), `${JSON.stringify(receipt, null, 2)}\n`);
    return receipt;
  } finally { await db.end(); }
}
async function main() {
  const action = process.argv[2];
  if (process.argv.length !== 3 || !['prepare', 'start', 'status', 'backup', 'restore', 'verify'].includes(action)) throw new Error('Use pilot-recovery.mjs prepare|start|status|backup|restore|verify.');
  assertLocalDockerSocket();
  if (action === 'prepare') {
    directory(path.join(recoveryWorkdir, 'supabase/migrations'));
    for (const [relative, value] of Object.entries(expectedFiles())) {
      const file = path.join(recoveryWorkdir, 'supabase', relative);
      safeRecoveryPath(file);
      try { lstatSync(file); assert.equal(sha(bytes(file)), sha(value)); } catch (error) { if (error.code !== 'ENOENT') throw error; exclusive(file, value); }
    }
    verifyLayout();
    return { prepared: true, project: recoveryProject, migrations: 10 };
  }
  verifyLayout();
  if (action === 'start') {
    for (const port of [57430, 57431, 57432, 57434, 3301]) {
      try { const out = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { stdio: ['ignore', 'pipe', 'pipe'] }); if (out.length) throw new Error('Recovery port is occupied; inspect before retry.'); } catch (error) { if (error.status !== 1) throw error; }
    }
    cli(['start'], 300_000);
  }
  if (action === 'start' || action === 'status') { getRecoveryStatus(); return { running: true, project: recoveryProject, apiPort: 57431, databasePort: 57432 }; }
  if (action === 'backup') return backup();
  if (action === 'restore') return restore();
  return verify();
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.umask(0o077);
  main().then(result => console.log(JSON.stringify(result))).catch((error) => {
    const code = /^[A-Z0-9_]{1,32}$/u.test(error.code ?? '') ? error.code : 'UNSPECIFIED';
    console.error(`Recovery drill failed (${code}). Preserve private evidence and inspect the exclusive recovery target; no reset or deletion was attempted.`);
    process.exitCode = 1;
  });
}
