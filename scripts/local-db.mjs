import { spawnSync } from 'node:child_process';
import { assertLocalProject, cliPath, cliEnv, projectRoot } from './local-environment.mjs';

const action = process.argv[2];
const commands = {
  start: ['start', '--exclude', 'studio,postgres-meta,realtime,imgproxy,edge-runtime,logflare,vector,supavisor'],
  reset: ['db', 'reset', '--local', '--yes'],
  migrate: ['migration', 'up', '--local'],
  stop: ['stop'],
};
try {
  assertLocalProject();
  if (!commands[action] || process.argv.length !== 3) throw new Error('Expected start, migrate, reset, or stop.');
  const result = spawnSync(process.execPath, [cliPath, ...commands[action]], {
    cwd: projectRoot, env: cliEnv, stdio: 'inherit',
  });
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
