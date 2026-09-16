import { getRecoveryStatus } from '../../scripts/pilot-recovery.mjs';
import { getLocalStatus } from '../../scripts/local-environment.mjs';
import { assertLocalDockerSocket, getPilotRuntimeStatus, validatePilotStatus } from '../../scripts/local-pilot.mjs';

export function databaseTestTarget(env = process.env) {
  const target = env.OPENMEMBERS_DATABASE_TEST_TARGET ?? 'development';
  if (!['development', 'pilot', 'recovery'].includes(target)) {
    throw new Error('Database tests require the documented development, pilot or recovery target.');
  }
  return target;
}

export function getDatabaseTestStatus() {
  if (databaseTestTarget() === 'development') return getLocalStatus();
  assertLocalDockerSocket();
  if (databaseTestTarget() === 'recovery') return getRecoveryStatus();
  const status = getPilotRuntimeStatus();
  validatePilotStatus(status);
  return status;
}
