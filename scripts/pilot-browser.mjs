import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertLocalDockerSocket,
  getPilotRuntimeStatus,
  ensurePilotApplicationFiles,
  pilotCliEnvironment,
  projectRoot,
  validatePilotStatus,
} from './local-pilot.mjs';
import {
  assertBrowserTestEnvironment,
  browserTestTarget,
} from '../e2e/fixtures/test-target.mjs';

export const pilotBrowserArgs = Object.freeze([
  'node_modules/@playwright/test/cli.js',
  'test',
  '--config',
  'playwright.pilot.config.ts',
]);

export function pilotBrowserEnvironment(status, inherited = process.env) {
  validatePilotStatus(status);
  const target = browserTestTarget({ OPENMEMBERS_BROWSER_TEST_TARGET: 'pilot' });
  const env = {
    ...pilotCliEnvironment(inherited),
    NEXT_TELEMETRY_DISABLED: '1',
    OPENMEMBERS_LOCAL_BROWSER_TEST: '1',
    OPENMEMBERS_BROWSER_TEST_TARGET: target.name,
    NEXT_PUBLIC_SITE_URL: target.appOrigin,
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    EMAIL_TRANSPORT: 'mailpit',
    MAILPIT_URL: status.INBUCKET_URL,
  };
  assertBrowserTestEnvironment(env, target.appOrigin);
  return env;
}

export function pilotBrowserArgsFor(action = 'core') {
  if (!['core', 'i4'].includes(action)) throw new Error('Pilot browser action must be core or i4.');
  return action === 'core' ? [...pilotBrowserArgs] : [...pilotBrowserArgs.slice(0, -1), 'playwright.i4.config.ts'];
}

export function pilotI4Environment(env, values) {
  if (!/^[a-f0-9]{64}$/u.test(values.CRON_SECRET ?? '')) throw new Error('Pilot I4 requires the validated local jobs secret.');
  return { ...env, OPENMEMBERS_PILOT_I4: '1', CRON_SECRET: values.CRON_SECRET };
}

function main() {
  if (process.argv.length > 3) throw new Error('Pilot browser accepts only one action.');
  const action = process.argv[2] ?? 'core';
  const args = pilotBrowserArgsFor(action);
  assertLocalDockerSocket();
  const status = getPilotRuntimeStatus();
  let env = pilotBrowserEnvironment(status);
  if (action === 'i4') {
    const { values } = ensurePilotApplicationFiles(status);
    env = pilotI4Environment(env, values);
  }
  const child = spawn(process.execPath, args, {
    cwd: projectRoot,
    env,
    stdio: 'inherit',
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => child.kill(signal));
  }
  child.on('exit', (code) => {
    process.exitCode = code ?? 1;
  });
  child.on('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

if (
  process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : 'The pilot browser runner failed.',
    );
    process.exitCode = 1;
  }
}
