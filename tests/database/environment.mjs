import { getRecoveryStatus } from '../../scripts/pilot-recovery.mjs';
import { getLocalStatus } from '../../scripts/local-environment.mjs';
import { assertLocalDockerSocket, getPilotRuntimeStatus, validatePilotStatus } from '../../scripts/local-pilot.mjs';

export function databaseTestTarget(env = process.env) {
  const target = env.OPENMEMBERS_DATABASE_TEST_TARGET ?? 'e5';
  if (!['e5', 'pilot', 'recovery'].includes(target)) {
    throw new Error('Database tests require the documented e5, pilot or recovery target.');
  }
  return target;
}

export function getDatabaseTestStatus() {
  if (databaseTestTarget() === 'e5') return getLocalStatus();
  assertLocalDockerSocket();
  if (databaseTestTarget() === 'recovery') return getRecoveryStatus();
  const status = getPilotRuntimeStatus();
  validatePilotStatus(status);
  return status;
}
