import { execFileSync } from 'node:child_process';
import { lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertLocalDockerSocket,
  ensurePilotApplicationFiles,
  getPilotRuntimeStatus,
  pilotApplicationEnv,
  pilotInstallationConfig,
  pilotRoot,
  projectRoot,
  validatePilotStatus,
  verifyPreparedPilot,
} from './local-pilot.mjs';

export const PILOT_COMPOSE_PROJECT = 'openmembers-e6-pilot-app';
export const PILOT_COMPOSE_SERVICE = 'pilot-app';
export const PILOT_APP_ACTIONS = Object.freeze(['preflight', 'start', 'status']);
export const pilotComposeFile = path.join(
  projectRoot,
  'deploy/compose.local-pilot.yaml',
);
const BUILDER_OVERRIDES = Object.freeze(['BUILDKIT_HOST', 'BUILDX_BUILDER']);

function assertCanonicalPilotFile(filePath, label) {
  const stat = lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a regular file, not a symlink.`);
  }
  const root = realpathSync(pilotRoot);
  const file = realpathSync(filePath);
  const relative = path.relative(root, file);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} must stay inside the pilot private directory.`);
  }
}

export function pilotComposeArgs(...args) {
  return [
    'compose',
    '-p',
    PILOT_COMPOSE_PROJECT,
    '--env-file',
    pilotApplicationEnv,
    '-f',
    pilotComposeFile,
    ...args,
  ];
}

const INHERITED_CONFIGURATION = /^(?:COMPOSE_|OPENMEMBERS_|NEXT_PUBLIC_|SUPABASE_|DATABASE_|AUTH_|OAUTH_|CRON_SECRET$|STRIPE_|RESEND_|BREVO_|R2_|SENTRY_|AI_GATEWAY_|EMAIL_|MAILPIT_|SEND_EMAIL_|CERTIFICATE_|COURSE_CHAT_|SUPPORT_|MEMBERSHIP_|GOOGLE_|APPLE_|GITHUB_)/u;

export function pilotComposeEnv(values, inherited = process.env) {
  const env = { ...inherited };
  for (const key of Object.keys(env)) {
    if (key === 'DOCKER_CONTEXT' || BUILDER_OVERRIDES.includes(key) || INHERITED_CONFIGURATION.test(key)) {
      delete env[key];
    }
  }
  return {
    ...env,
    ...values,
    COMPOSE_PROJECT_NAME: PILOT_COMPOSE_PROJECT,
  };
}

export function localComposeBuildArgs(service, inherited = process.env) {
  assertLocalDockerSocket(inherited);
  for (const key of BUILDER_OVERRIDES) {
    if (inherited[key]?.trim()) {
      throw new Error(`Unset ${key} before building with the local Docker daemon.`);
    }
  }
  return ['build', '--builder', 'default', service];
}

function pilotContext() {
  verifyPreparedPilot();
  assertLocalDockerSocket();
  const runtime = getPilotRuntimeStatus();
  const { values } = ensurePilotApplicationFiles(runtime);
  assertCanonicalPilotFile(pilotApplicationEnv, 'Pilot application environment');
  assertCanonicalPilotFile(pilotInstallationConfig, 'Pilot presentation config');
  return {
    env: pilotComposeEnv(values),
    safeStatus: validatePilotStatus(runtime),
  };
}

function runCompose(args, env, timeout = 30_000, output = false) {
  try {
    return execFileSync('docker', pilotComposeArgs(...args), {
      cwd: projectRoot,
      env,
      timeout,
      encoding: 'utf8',
      stdio: ['ignore', output ? 'pipe' : 'ignore', 'pipe'],
    });
  } catch {
    throw new Error('The isolated pilot application command failed.');
  }
}

async function assertHealthyApplication() {
  let response;
  try {
    response = await fetch('http://127.0.0.1:3201/api/health', {
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error('The isolated pilot application health check failed.');
  }
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error('The isolated pilot application health response is invalid.');
  }
  if (!response.ok || body?.status !== 'ok' || body?.db !== 'ok') {
    throw new Error('The isolated pilot application is not healthy.');
  }
}

function safePrint(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

async function main() {
  const action = process.argv[2];
  if (!PILOT_APP_ACTIONS.includes(action)) {
    throw new Error(
      `Usage: node scripts/local-pilot-app.mjs ${PILOT_APP_ACTIONS.join('|')}`,
    );
  }
  const context = pilotContext();
  runCompose(['config', '--quiet'], context.env);

  if (action === 'preflight') {
    safePrint({ ready: true, ...context.safeStatus });
    return;
  }
  if (action === 'start') {
    runCompose(localComposeBuildArgs(PILOT_COMPOSE_SERVICE), context.env, 900_000);
    runCompose(
      ['up', '-d', '--wait', '--wait-timeout', '180', PILOT_COMPOSE_SERVICE],
      context.env,
      240_000,
    );
  } else {
    const services = runCompose(
      ['ps', '--status', 'running', '--services'],
      context.env,
      30_000,
      true,
    )
      .trim()
      .split(/\r?\n/u)
      .filter(Boolean);
    if (services.length !== 1 || services[0] !== PILOT_COMPOSE_SERVICE) {
      throw new Error('The isolated pilot application service is not running.');
    }
  }
  await assertHealthyApplication();
  safePrint({ running: true, port: 3201, databasePort: context.safeStatus.databasePort });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'The pilot application command failed.'}\n`,
    );
    process.exitCode = 1;
  });
}
