import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmodSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLocalDockerSocket, pilotCliEnvironment, projectRoot } from './local-pilot.mjs';
import { localComposeBuildArgs } from './local-pilot-app.mjs';
import {
  getRecoveryStatus, recoveryRoot, safeRecoveryPath,
  validateBackupManifest, validateRecoveryStatus,
} from './pilot-recovery.mjs';

export const RECOVERY_APP_PROJECT = 'openmembers-e6-restore-app';
export const RECOVERY_APP_SERVICE = 'restore-app';
export const RECOVERY_APP_ACTIONS = Object.freeze(['prepare', 'preflight', 'start', 'status']);
export const recoveryComposeFile = path.join(projectRoot, 'deploy/compose.local-recovery.yaml');
export const recoveryApplicationEnv = path.join(recoveryRoot, 'application.env');
export const recoveryPresentation = path.join(recoveryRoot, 'installation.json');
const digest = value => createHash('sha256').update(value).digest('hex');

function entry(file) {
  safeRecoveryPath(file);
  try { return lstatSync(file); } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}

function regularBytes(file) {
  if (!entry(file)?.isFile()) throw new Error('Recovery application input must be a regular file.');
  return readFileSync(file);
}

function backedUpPresentation(root) {
  const backup = path.join(root, 'backup');
  const manifest = JSON.parse(regularBytes(path.join(backup, 'manifest.json')).toString());
  const checked = new Map();
  validateBackupManifest(manifest, file => {
    const value = regularBytes(path.join(backup, file));
    checked.set(file, value);
    return value;
  });
  // Reuse the exact checked bytes, not a second unchecked read after validation.
  const presentation = checked.get('installation.json');
  const value = JSON.parse(presentation.toString());
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Backed-up presentation must be a JSON object.');
  }
  return presentation;
}

function expectedValues(status) {
  validateRecoveryStatus(status);
  return {
    NEXT_PUBLIC_SITE_URL: 'http://localhost:3301',
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:57431',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    SUPABASE_INTERNAL_URL: 'http://host.docker.internal:57431',
    OPENMEMBERS_INTERNAL_URL: 'http://127.0.0.1:3000',
    EMAIL_TRANSPORT: 'mailpit',
    MAILPIT_URL: 'http://host.docker.internal:57434',
    COURSE_CHAT_ENABLED: 'false',
    OAUTH_PROVIDERS: '',
  };
}

export function validateRecoveryApplicationEnv(values, status) {
  const expected = expectedValues(status);
  const actualKeys = Object.keys(values).sort();
  const expectedKeys = [...Object.keys(expected), 'CRON_SECRET'].sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    throw new Error('Recovery application environment has unexpected keys.');
  }
  for (const [key, value] of Object.entries(expected)) {
    if (values[key] !== value) throw new Error(`Recovery application has an unexpected ${key}.`);
  }
  if (!/^[a-f0-9]{64}$/u.test(values.CRON_SECRET ?? '')) {
    throw new Error('Recovery application requires a generated 64-character CRON_SECRET.');
  }
  return values;
}

function parseEnvironment(text) {
  const values = {};
  for (const line of text.split(/\r?\n/u)) {
    if (!line.trim()) continue;
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/u);
    if (!match || Object.hasOwn(values, match[1])) throw new Error('Recovery application environment syntax is invalid.');
    values[match[1]] = match[2];
  }
  return values;
}

function applicationFiles(status, { root = recoveryRoot, create = false } = {}) {
  validateRecoveryStatus(status);
  if (!entry(root)?.isDirectory()) throw new Error('Prepare the isolated recovery workdir first.');
  const envPath = path.join(root, 'application.env');
  const presentationPath = path.join(root, 'installation.json');
  // Inspect every output before reading backup contents or writing either file.
  const envEntry = entry(envPath);
  const presentationEntry = entry(presentationPath);
  if ((!envEntry || !presentationEntry) && !create) {
    throw new Error('Prepare the recovery application files before preflight, start or status.');
  }
  const presentation = backedUpPresentation(root);
  if (presentationEntry) {
    if (!presentationEntry.isFile() || !regularBytes(presentationPath).equals(presentation)) {
      throw new Error('Recovery presentation differs from the verified backup.');
    }
    if ((presentationEntry.mode & 0o777) !== 0o644) {
      throw new Error('Recovery presentation permissions must be 0644 for the application container.');
    }
  }
  let values;
  if (envEntry) {
    if (!envEntry.isFile() || (envEntry.mode & 0o777) !== 0o600) {
      throw new Error('Recovery application environment permissions must be 0600.');
    }
    values = validateRecoveryApplicationEnv(parseEnvironment(regularBytes(envPath).toString()), status);
  } else {
    // Only destination status supplies credentials; backup application.env is hash evidence.
    values = validateRecoveryApplicationEnv({ ...expectedValues(status), CRON_SECRET: randomBytes(32).toString('hex') }, status);
  }
  if (create) {
    if (!presentationEntry) {
      writeFileSync(presentationPath, presentation, { flag: 'wx', mode: 0o644 });
      chmodSync(presentationPath, 0o644);
    }
    if (!envEntry) {
      const text = `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n')}\n`;
      writeFileSync(envPath, text, { flag: 'wx', mode: 0o600 });
      chmodSync(envPath, 0o600);
    }
  }
  return { envPath, presentationPath, presentationSha256: digest(presentation), values };
}

export function prepareRecoveryApplicationFiles(status, options = {}) {
  return applicationFiles(status, { ...options, create: true });
}

export function readRecoveryApplicationFiles(status, options = {}) {
  return applicationFiles(status, { ...options, create: false });
}

export function recoveryComposeArgs(...args) {
  return ['compose', '-p', RECOVERY_APP_PROJECT, '--env-file', recoveryApplicationEnv, '-f', recoveryComposeFile, ...args];
}

export function recoveryComposeEnv(values, inherited = process.env) {
  const env = pilotCliEnvironment(inherited);
  delete env.BUILDKIT_HOST;
  delete env.BUILDX_BUILDER;
  return { ...env, ...values, COMPOSE_PROJECT_NAME: RECOVERY_APP_PROJECT };
}

export function recoveryBuildArgs(inherited = process.env) {
  return localComposeBuildArgs(RECOVERY_APP_SERVICE, inherited);
}

export function runRecoveryCompose(args, values, { timeout = 30_000, output = false, inherited = process.env } = {}) {
  assertLocalDockerSocket(inherited);
  try {
    return execFileSync('docker', recoveryComposeArgs(...args), {
      cwd: projectRoot, env: recoveryComposeEnv(values, inherited), timeout,
      encoding: 'utf8', stdio: ['ignore', output ? 'pipe' : 'ignore', 'pipe'],
    });
  } catch {
    throw new Error('The isolated recovery application command failed; private configuration was not printed.');
  }
}

async function healthyApplication() {
  let response;
  let value;
  try {
    response = await fetch('http://127.0.0.1:3301/api/health', {
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000),
    });
    value = await response.json();
  } catch {
    throw new Error('The isolated recovery application health check failed.');
  }
  if (!response.ok || value?.status !== 'ok' || value?.db !== 'ok') {
    throw new Error('The isolated recovery application is not healthy.');
  }
}

async function main() {
  const action = process.argv[2];
  if (process.argv.length !== 3 || !RECOVERY_APP_ACTIONS.includes(action)) {
    throw new Error('Use pilot-recovery-app.mjs prepare|preflight|start|status.');
  }
  assertLocalDockerSocket();
  const status = getRecoveryStatus();
  if (action === 'prepare') {
    const prepared = prepareRecoveryApplicationFiles(status);
    return { prepared: true, project: RECOVERY_APP_PROJECT, port: 3301, presentationSha256: prepared.presentationSha256 };
  }
  const { values } = readRecoveryApplicationFiles(status);
  runRecoveryCompose(['config', '--quiet'], values);
  if (action === 'preflight') return { ready: true, project: RECOVERY_APP_PROJECT, port: 3301, databasePort: 57432 };
  if (action === 'start') {
    runRecoveryCompose(recoveryBuildArgs(), values, { timeout: 900_000 });
    runRecoveryCompose(['up', '-d', '--wait', '--wait-timeout', '180', RECOVERY_APP_SERVICE], values, { timeout: 240_000 });
  } else {
    const services = runRecoveryCompose(['ps', '--status', 'running', '--services'], values, { output: true })
      .trim().split(/\r?\n/u).filter(Boolean);
    if (services.length !== 1 || services[0] !== RECOVERY_APP_SERVICE) {
      throw new Error('The isolated recovery application service is not running.');
    }
  }
  await healthyApplication();
  return { running: true, project: RECOVERY_APP_PROJECT, port: 3301, databasePort: 57432 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(result => console.log(JSON.stringify(result))).catch(() => {
    console.error('Recovery application operation failed. Inspect the isolated restore application; no database reset, seed or service stop was attempted.');
    process.exitCode = 1;
  });
}
