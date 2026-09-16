import { spawn } from 'node:child_process';
import { getLocalStatus, localAppEnv, projectRoot } from './local-environment.mjs';

try {
  const mode = process.argv[2];
  const commands = {
    dev: ['node_modules/next/dist/bin/next', 'dev', '--hostname', 'localhost'],
    build: ['node_modules/next/dist/bin/next', 'build'],
    start: ['node_modules/next/dist/bin/next', 'start', '--hostname', 'localhost', '--port', '3101'],
    browser: ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.database.config.ts'],
    'docs-browser': ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.documentation.config.ts'],
  };
  if (!commands[mode] || process.argv.length !== 3) throw new Error('Expected dev, build, start, browser, or docs-browser.');
  const status = getLocalStatus();
  const env = localAppEnv(status, mode === 'dev' ? '3000' : '3101');
  // Only guarded browser commands may enable per-context test identities.
  env.OPENMEMBERS_LOCAL_BROWSER_TEST = ['browser', 'docs-browser'].includes(mode) ? '1' : '';
  const child = spawn(process.execPath, commands[mode], {
    cwd: projectRoot, env, stdio: 'inherit',
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  child.on('exit', code => { process.exitCode = code ?? 1; });
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
