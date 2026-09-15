import { test } from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { recoveryConfig, safeRecoveryPath, validateRecoveryStatus, validateBackupManifest, cacheControlSeconds, validateDatabaseContainer, validateRecoveryBranch } from '../../scripts/pilot-recovery.mjs';

const status = { API_URL: 'http://127.0.0.1:57431', DB_URL: 'postgresql://postgres:synthetic@127.0.0.1:57432/postgres', INBUCKET_URL: 'http://127.0.0.1:57434', ANON_KEY: 'synthetic.anon', SERVICE_ROLE_KEY: 'synthetic.service' };

test('recovery destination accepts only exclusive loopback services', () => {
  assert.equal(validateRecoveryStatus(status), status);
  for (const altered of [
    { ...status, API_URL: 'http://127.0.0.1:56431' },
    { ...status, DB_URL: 'postgresql://postgres:synthetic@127.0.0.1:55432/postgres' },
    { ...status, DB_URL: 'postgresql://postgres:synthetic@db.example.test:57432/postgres' },
    { ...status, INBUCKET_URL: 'http://127.0.0.1:57434/path' },
    { ...status, API_URL: 'http://user:pass@127.0.0.1:57431' },
    { ...status, API_URL: 'http://127.0.0.1:57431/?remote=1' },
    { ...status, SERVICE_ROLE_KEY: '' },
  ]) assert.throws(() => validateRecoveryStatus(altered), /Recovery/u);
});

test('recovery layout derives an exclusive config without E5 or pilot ports', () => {
  const original = readFileSync('deploy/local-pilot/supabase.config.toml', 'utf8');
  const configured = recoveryConfig(original);
  assert.match(configured, /project_id = "openmembers-e6-restore"/u);
  for (const port of ['57430', '57431', '57432', '57434', '3301']) assert.ok(configured.includes(port));
  assert.doesNotMatch(configured, /5543[0124]|5643[0124]|3201/u);
  assert.match(configured, /enable_confirmations = true/u);
  assert.match(configured, /enable_anonymous_sign_ins = false/u);
});

test('recovery refuses live and dangling symlinks in every ancestor without touching targets', () => {
  const root = mkdtempSync(path.join(realpathSync(os.tmpdir()), 'openmembers-recovery-test-'));
  try {
    const outside = path.join(root, 'outside');
    mkdirSync(outside);
    const sentinel = path.join(outside, 'sentinel');
    writeFileSync(sentinel, 'unchanged');
    symlinkSync(outside, path.join(root, 'linked'));
    symlinkSync(path.join(outside, 'absent'), path.join(root, 'dangling'));
    for (const file of [path.join(root, 'linked/sentinel'), path.join(root, 'linked/new/file'), path.join(root, 'dangling/new/file')]) assert.throws(() => safeRecoveryPath(file), /symlinks/u);
    assert.equal(readFileSync(sentinel, 'utf8'), 'unchanged');
    assert.doesNotThrow(() => safeRecoveryPath(path.join(root, 'new/file')));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('backup manifest requires the complete unique index before any payload read', () => {
  const hash = createHash('sha256').update('fixture').digest('hex');
  const manifest = { schemaVersion: 1, source: 'openmembers-e6-pilot', target: 'openmembers-e6-restore', tables: [], migrations: [], buckets: [], objects: [], files: ['roles.sql', 'schema.sql', 'data.sql', 'installation.json', 'application.env', 'migration-manifest.json'].map(file => ({ file, sha256: hash })) };
  let reads = 0;
  const read = () => { reads++; return Buffer.from('fixture'); };
  for (const files of [manifest.files.filter(item => item.file !== 'data.sql'), [...manifest.files, manifest.files[0]], manifest.files.map(item => ({ ...item, file: item.file === 'data.sql' ? '../data.sql' : item.file }))]) {
    assert.throws(() => validateBackupManifest({ ...manifest, files }, read), /canonical artifact/u);
    assert.equal(reads, 0);
  }
  assert.equal(validateBackupManifest(manifest, read), manifest);
  assert.equal(reads, 6);
  assert.throws(() => validateBackupManifest(manifest, () => Buffer.from('changed')), /checksum/u);
});

test('Storage cache-control is normalized without duplicating max-age', () => {
  assert.equal(cacheControlSeconds('max-age=3600'), '3600');
  assert.equal(cacheControlSeconds('60'), '60');
  assert.equal(cacheControlSeconds(), '3600');
  assert.throws(() => cacheControlSeconds('max-age=max-age=3600'), /Unsupported/u);
});

test('database container must match the project label and actual published database port', () => {
  const info = { id: 'a'.repeat(64), name: '/supabase_db_openmembers-e6-restore', project: 'openmembers-e6-restore', ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '57432' }] } };
  assert.equal(validateDatabaseContainer(info, 'openmembers-e6-restore', 57432), info.id);
  assert.throws(() => validateDatabaseContainer(info, 'openmembers', 55432));
  assert.throws(() => validateDatabaseContainer({ ...info, project: 'openmembers-e6-pilot' }, 'openmembers-e6-restore', 57432));
  assert.throws(() => validateDatabaseContainer({ ...info, ports: { '5432/tcp': [{ HostPort: '56432' }] } }, 'openmembers-e6-restore', 57432));
});

test('CLI-created default branch marker is allowed and alternate branches are refused', () => {
  assert.doesNotThrow(() => validateRecoveryBranch('main'));
  for (const value of ['', 'production', 'main/other']) assert.throws(() => validateRecoveryBranch(value), /default local/u);
});
