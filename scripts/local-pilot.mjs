import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  constants,
  copyFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export const pilotRoot = path.join(projectRoot, '.private/e6-local-pilot');
export const pilotWorkdir = path.join(pilotRoot, 'workdir');
export const pilotConfigTemplate = path.join(
  projectRoot,
  'deploy/local-pilot/supabase.config.toml',
);
export const sourceMigrations = path.join(projectRoot, 'supabase/migrations');
export const pilotApplicationEnv = path.join(pilotRoot, 'application.env');
export const pilotInstallationConfig = path.join(pilotRoot, 'installation.json');
export const installationConfigTemplate = path.join(
  projectRoot,
  'openmembers.config.example.json',
);
export const cliPath = path.join(
  projectRoot,
  'node_modules/supabase/dist/supabase.js',
);

export const PILOT_PROJECT_ID = 'openmembers-e6-pilot';
export const PILOT_PORTS = Object.freeze({
  shadow: 56430,
  api: 56431,
  database: 56432,
  mailpit: 56434,
  application: 3201,
});
export const PILOT_ACTIONS = Object.freeze([
  'prepare',
  'preflight',
  'start',
  'status',
]);

const INHERITED_CONFIGURATION = /^(?:COMPOSE_|OPENMEMBERS_|NEXT_PUBLIC_|SUPABASE_|DATABASE_|AUTH_|OAUTH_|CRON_SECRET$|STRIPE_|RESEND_|BREVO_|R2_|SENTRY_|AI_GATEWAY_|EMAIL_|MAILPIT_|SEND_EMAIL_|CERTIFICATE_|COURSE_CHAT_|SUPPORT_|MEMBERSHIP_|GOOGLE_|APPLE_|GITHUB_)/u;

export function pilotCliEnvironment(inherited = process.env) {
  const env = { ...inherited };
  for (const key of Object.keys(env)) {
    if (key === 'DOCKER_CONTEXT' || INHERITED_CONFIGURATION.test(key)) {
      delete env[key];
    }
  }
  return {
    ...env,
    SUPABASE_TELEMETRY_DISABLED: '1',
    DO_NOT_TRACK: '1',
    SUPABASE_ACCESS_TOKEN: '',
  };
}

const MIGRATION_NAME = /^\d{14}_[a-z0-9_]+\.sql$/;
const PILOT_ENV_KEYS = Object.freeze([
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_INTERNAL_URL',
  'OPENMEMBERS_INTERNAL_URL',
  'CRON_SECRET',
  'EMAIL_TRANSPORT',
  'MAILPIT_URL',
  'COURSE_CHAT_ENABLED',
  'OAUTH_PROVIDERS',
]);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function inside(directory, target) {
  const relative = path.relative(directory, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function pathBoundary(target) {
  // The OS temp directory may itself use a system alias (for example /var on macOS).
  // Trust that existing base, while checking every task-controlled component below it.
  const bases = [projectRoot, tmpdir(), realpathSync(tmpdir())].map(base => path.resolve(base));
  return bases.filter(base => inside(base, target)).sort((a, b) => b.length - a.length)[0]
    ?? path.parse(target).root;
}

function inspectSafePath(filePath) {
  const target = path.resolve(filePath);
  const boundary = pathBoundary(target);
  const parts = path.relative(boundary, target).split(path.sep).filter(Boolean);
  let current = boundary;
  let stat = lstatSync(current);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Pilot path base must be a regular directory.');
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    try { stat = lstatSync(current); } catch (error) {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    }
    if (stat.isSymbolicLink()) throw new Error('Pilot paths must not contain symlinks.');
    if (index < parts.length - 1 && !stat.isDirectory()) throw new Error('Pilot path ancestors must be directories.');
  }
  return stat;
}

function createSafeDirectories(directory) {
  // Validate the entire existing path before the first mkdir, including .private.
  inspectSafePath(directory);
  const target = path.resolve(directory);
  const boundary = pathBoundary(target);
  let current = boundary;
  for (const part of path.relative(boundary, target).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if (!inspectSafePath(current)) mkdirSync(current);
    assertDirectory(current, 'Pilot directory');
  }
}

function assertRegularFile(filePath, label) {
  let stat;
  try {
    stat = inspectSafePath(filePath);
  } catch {
    throw new Error(`${label} is unavailable or has an unsafe path.`);
  }
  if (!stat?.isFile()) {
    throw new Error(`${label} must be a regular file, not a symlink.`);
  }
  return stat;
}

function assertDirectory(directory, label) {
  let stat;
  try {
    stat = inspectSafePath(directory);
  } catch {
    throw new Error(`${label} is unavailable or has an unsafe path.`);
  }
  if (!stat?.isDirectory()) {
    throw new Error(`${label} must be a directory, not a symlink.`);
  }
}

function migrationFiles(directory) {
  assertDirectory(directory, 'Migrations directory');
  const entries = readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink() || !MIGRATION_NAME.test(entry.name)) {
      throw new Error(`Unexpected migration entry: ${entry.name}`);
    }
  }
  return entries.map(({ name }) => name).sort();
}

function sameFile(left, right) {
  assertRegularFile(left, 'Canonical file');
  assertRegularFile(right, 'Prepared file');
  return sha256(readFileSync(left)) === sha256(readFileSync(right));
}

function expectedManifest(migrationsDir) {
  const files = migrationFiles(migrationsDir);
  if (files.length === 0) throw new Error('No canonical migrations were found.');
  return {
    schemaVersion: 1,
    projectId: PILOT_PROJECT_ID,
    files: files.map((name) => ({
      path: `supabase/migrations/${name}`,
      sha256: sha256(readFileSync(path.join(migrationsDir, name))),
    })),
  };
}

function writeIfAbsentOrEqual(source, target, label) {
  assertRegularFile(source, `${label} source`);
  if (inspectSafePath(target)) {
    assertRegularFile(target, label);
    if (!sameFile(source, target)) {
      throw new Error(`${label} differs from the canonical source.`);
    }
    return;
  }
  copyFileSync(source, target, constants.COPYFILE_EXCL);
}

function validateInstallationConfig(filePath) {
  assertRegularFile(filePath, 'Pilot presentation config');
  let value;
  try {
    value = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    throw new Error('Pilot presentation config must contain valid JSON.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Pilot presentation config must contain a JSON object.');
  }
}

export function preparePilotLayout({
  root = pilotRoot,
  configTemplate = pilotConfigTemplate,
  migrationsDir = sourceMigrations,
  presentationTemplate = installationConfigTemplate,
} = {}) {
  const workdir = path.join(root, 'workdir');
  const targetSupabase = path.join(workdir, 'supabase');
  const targetMigrations = path.join(targetSupabase, 'migrations');
  const manifestPath = path.join(root, 'migration-manifest.json');
  // Check every destination before copying anything, including broken links.
  for (const target of [targetMigrations, path.join(targetSupabase, 'config.toml'), path.join(root, 'installation.json'), manifestPath]) {
    inspectSafePath(target);
  }
  createSafeDirectories(targetMigrations);
  assertDirectory(root, 'Pilot private directory');
  assertDirectory(workdir, 'Pilot workdir');
  assertDirectory(targetSupabase, 'Pilot Supabase directory');
  assertDirectory(targetMigrations, 'Pilot migrations directory');

  assertRegularFile(configTemplate, 'Pilot config template');
  const configText = readFileSync(configTemplate, 'utf8');
  validatePilotConfig(configText);
  writeIfAbsentOrEqual(
    configTemplate,
    path.join(targetSupabase, 'config.toml'),
    'Prepared pilot config',
  );

  const presentationPath = path.join(root, 'installation.json');
  if (!inspectSafePath(presentationPath)) {
    assertRegularFile(presentationTemplate, 'Presentation template');
    copyFileSync(presentationTemplate, presentationPath, constants.COPYFILE_EXCL);
    chmodSync(presentationPath, 0o644);
  }
  validateInstallationConfig(presentationPath);

  const manifest = expectedManifest(migrationsDir);
  const expectedNames = new Set(
    manifest.files.map(({ path: filePath }) => path.basename(filePath)),
  );
  for (const targetName of migrationFiles(targetMigrations)) {
    if (!expectedNames.has(targetName)) {
      throw new Error(`Unexpected prepared migration: ${targetName}`);
    }
  }
  for (const name of expectedNames) {
    writeIfAbsentOrEqual(
      path.join(migrationsDir, name),
      path.join(targetMigrations, name),
      `Prepared migration ${name}`,
    );
  }
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  if (inspectSafePath(manifestPath)) {
    assertRegularFile(manifestPath, 'Pilot migration manifest');
    if (readFileSync(manifestPath, 'utf8') !== manifestText) {
      throw new Error('Pilot migration manifest differs from canonical migrations.');
    }
  } else {
    writeFileSync(manifestPath, manifestText, { mode: 0o600, flag: 'wx' });
  }
  chmodSync(manifestPath, 0o600);
  return {
    workdir,
    manifestPath,
    presentationPath,
    migrationCount: manifest.files.length,
  };
}

function scalar(text, section, key) {
  let current = '';
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, '').trim();
    const heading = line.match(/^\[([^\]]+)\]$/);
    if (heading) {
      current = heading[1];
      continue;
    }
    if (current !== section) continue;
    const match = line.match(new RegExp(`^${key}\\s*=\\s*(.+)$`));
    if (!match) continue;
    const value = match[1].trim();
    return /^".*"$/.test(value) ? value.slice(1, -1) : value;
  }
  return undefined;
}

export function validatePilotConfig(text) {
  const expected = [
    ['', 'project_id', PILOT_PROJECT_ID],
    ['api', 'port', String(PILOT_PORTS.api)],
    ['db', 'port', String(PILOT_PORTS.database)],
    ['db', 'shadow_port', String(PILOT_PORTS.shadow)],
    ['local_smtp', 'port', String(PILOT_PORTS.mailpit)],
    ['auth', 'site_url', `http://localhost:${PILOT_PORTS.application}`],
  ];
  for (const [section, key, value] of expected) {
    if (scalar(text, section, key) !== value) {
      throw new Error(`Pilot config has an unexpected ${section || 'root'}.${key}.`);
    }
  }
  const redirects = scalar(text, 'auth', 'additional_redirect_urls');
  if (redirects !== `["http://localhost:${PILOT_PORTS.application}/**"]`) {
    throw new Error('Pilot config has unexpected Auth redirect URLs.');
  }
  for (const developmentPort of ['55430', '55431', '55432', '55434']) {
    if (new RegExp(`(^|[^0-9])${developmentPort}([^0-9]|$)`).test(text)) {
      throw new Error('Pilot config must not reference a development port.');
    }
  }
  return true;
}

export function verifyPreparedPilot({
  root = pilotRoot,
  configTemplate = pilotConfigTemplate,
  migrationsDir = sourceMigrations,
} = {}) {
  const targetSupabase = path.join(root, 'workdir/supabase');
  const targetConfig = path.join(targetSupabase, 'config.toml');
  const targetMigrations = path.join(targetSupabase, 'migrations');
  const manifestPath = path.join(root, 'migration-manifest.json');
  if (!inspectSafePath(targetConfig) || !inspectSafePath(manifestPath)) {
    throw new Error('Pilot workdir is not prepared.');
  }
  assertDirectory(root, 'Pilot private directory');
  assertDirectory(path.join(root, 'workdir'), 'Pilot workdir');
  assertDirectory(targetSupabase, 'Pilot Supabase directory');
  assertDirectory(targetMigrations, 'Pilot migrations directory');
  assertRegularFile(targetConfig, 'Prepared pilot config');
  assertRegularFile(manifestPath, 'Pilot migration manifest');
  validateInstallationConfig(path.join(root, 'installation.json'));
  validatePilotConfig(readFileSync(targetConfig, 'utf8'));
  if (!sameFile(configTemplate, targetConfig)) {
    throw new Error('Prepared pilot config differs from the tracked template.');
  }
  if (inspectSafePath(path.join(targetSupabase, '.temp/project-ref'))) {
    throw new Error('Refusing a pilot workdir linked to a remote project.');
  }
  const expected = expectedManifest(migrationsDir);
  let recorded;
  try {
    recorded = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    throw new Error('Pilot migration manifest is invalid.');
  }
  if (JSON.stringify(recorded) !== JSON.stringify(expected)) {
    throw new Error('Pilot migration manifest differs from canonical migrations.');
  }
  const targetNames = migrationFiles(targetMigrations);
  const expectedNames = expected.files.map(({ path: filePath }) =>
    path.basename(filePath),
  );
  if (JSON.stringify(targetNames) !== JSON.stringify(expectedNames)) {
    throw new Error('Prepared pilot migration set is incomplete or unexpected.');
  }
  for (const name of expectedNames) {
    if (!sameFile(path.join(migrationsDir, name), path.join(targetMigrations, name))) {
      throw new Error(`Prepared migration ${name} differs from canonical source.`);
    }
  }
  return { migrationCount: expected.files.length };
}

export function validatePilotStatus(status) {
  const endpoints = [
    ['API_URL', ['http:'], PILOT_PORTS.api],
    ['DB_URL', ['postgres:', 'postgresql:'], PILOT_PORTS.database],
    ['INBUCKET_URL', ['http:'], PILOT_PORTS.mailpit],
  ];
  for (const [key, protocols, port] of endpoints) {
    let url;
    try {
      url = new URL(status?.[key]);
    } catch {
      throw new Error(`Pilot ${key} is unavailable.`);
    }
    if (
      !protocols.includes(url.protocol) ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      url.port !== String(port)
    ) {
      throw new Error(`Refusing unexpected pilot ${key}.`);
    }
  }
  if (!status.ANON_KEY || !status.SERVICE_ROLE_KEY) {
    throw new Error('Pilot Supabase keys are unavailable.');
  }
  return {
    projectId: PILOT_PROJECT_ID,
    apiPort: PILOT_PORTS.api,
    databasePort: PILOT_PORTS.database,
    mailpitPort: PILOT_PORTS.mailpit,
    credentialsAvailable: true,
  };
}

function parsePilotApplicationEnv(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = rawLine.match(/^([A-Z][A-Z0-9_]*)=(.*)$/u);
    if (!match || Object.hasOwn(values, match[1])) {
      throw new Error('Pilot application environment has invalid syntax.');
    }
    values[match[1]] = match[2];
  }
  return values;
}

function validatePilotApplicationEnv(values, status) {
  validatePilotStatus(status);
  const keys = Object.keys(values).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...PILOT_ENV_KEYS].sort())) {
    throw new Error('Pilot application environment has unexpected keys.');
  }
  const expected = {
    NEXT_PUBLIC_SITE_URL: `http://localhost:${PILOT_PORTS.application}`,
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${PILOT_PORTS.api}`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    SUPABASE_INTERNAL_URL: `http://host.docker.internal:${PILOT_PORTS.api}`,
    OPENMEMBERS_INTERNAL_URL: 'http://127.0.0.1:3000',
    EMAIL_TRANSPORT: 'mailpit',
    MAILPIT_URL: `http://host.docker.internal:${PILOT_PORTS.mailpit}`,
    COURSE_CHAT_ENABLED: 'false',
    OAUTH_PROVIDERS: '',
  };
  for (const [key, value] of Object.entries(expected)) {
    if (values[key] !== value) {
      throw new Error(`Pilot application environment has an unexpected ${key}.`);
    }
  }
  if (!/^[a-f0-9]{64}$/u.test(values.CRON_SECRET ?? '')) {
    throw new Error('Pilot application environment has an invalid CRON_SECRET.');
  }
  return values;
}

function serializePilotApplicationEnv(status) {
  for (const key of ['ANON_KEY', 'SERVICE_ROLE_KEY']) {
    if (!/^[A-Za-z0-9._-]+$/u.test(status[key] ?? '')) {
      throw new Error('Pilot Supabase returned an unsafe credential value.');
    }
  }
  const values = {
    NEXT_PUBLIC_SITE_URL: `http://localhost:${PILOT_PORTS.application}`,
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${PILOT_PORTS.api}`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    SUPABASE_INTERNAL_URL: `http://host.docker.internal:${PILOT_PORTS.api}`,
    OPENMEMBERS_INTERNAL_URL: 'http://127.0.0.1:3000',
    CRON_SECRET: randomBytes(32).toString('hex'),
    EMAIL_TRANSPORT: 'mailpit',
    MAILPIT_URL: `http://host.docker.internal:${PILOT_PORTS.mailpit}`,
    COURSE_CHAT_ENABLED: 'false',
    OAUTH_PROVIDERS: '',
  };
  validatePilotApplicationEnv(values, status);
  return `${PILOT_ENV_KEYS.map((key) => `${key}=${values[key]}`).join('\n')}\n`;
}

export function ensurePilotApplicationFiles(
  status,
  options = {},
) {
  const { root = pilotRoot } = options;
  verifyPreparedPilot(options);
  const envPath = path.join(root, 'application.env');
  if (!inspectSafePath(envPath)) {
    writeFileSync(envPath, serializePilotApplicationEnv(status), {
      mode: 0o600,
      flag: 'wx',
    });
  }
  const stat = assertRegularFile(envPath, 'Pilot application environment');
  if ((stat.mode & 0o077) !== 0) {
    throw new Error('Pilot application environment permissions must be 0600.');
  }
  const values = validatePilotApplicationEnv(
    parsePilotApplicationEnv(readFileSync(envPath, 'utf8')),
    status,
  );
  validateInstallationConfig(path.join(root, 'installation.json'));
  return { envPath, values };
}

export function pilotCliArgs(...args) {
  return ['--workdir', pilotWorkdir, ...args];
}

export function assertLocalDockerSocket(inherited = process.env) {
  if (inherited.DOCKER_CONTEXT?.trim()) {
    throw new Error('Unset DOCKER_CONTEXT before running the local pilot.');
  }
  let dockerHost = inherited.DOCKER_HOST?.trim();
  if (!dockerHost) {
    try {
      dockerHost = execFileSync(
        'docker',
        ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'],
        {
          timeout: 5_000,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      ).trim();
    } catch {
      throw new Error('The local Docker context could not be verified.');
    }
  }
  if (!dockerHost.startsWith('unix://')) {
    throw new Error('The pilot requires a local Unix Docker socket.');
  }
}

function assertPortAvailable(port) {
  try {
    const output = execFileSync(
      'lsof',
      ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'],
      { timeout: 3_000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    if (output.trim()) throw new Error(`Pilot port ${port} is already in use.`);
  } catch (error) {
    if (error?.status === 1) return;
    if (error instanceof Error && error.message.includes('already in use')) {
      throw error;
    }
    throw new Error(`Pilot port ${port} could not be verified.`);
  }
}

export function preflightPilot() {
  const verified = verifyPreparedPilot();
  assertLocalDockerSocket();
  for (const port of Object.values(PILOT_PORTS)) assertPortAvailable(port);
  return verified;
}

export function runSupabase(args, { output = false, timeout = 30_000 } = {}) {
  assertLocalDockerSocket();
  try {
    return execFileSync(process.execPath, [cliPath, ...pilotCliArgs(...args)], {
      cwd: projectRoot,
      env: pilotCliEnvironment(),
      timeout,
      encoding: 'utf8',
      stdio: ['ignore', output ? 'pipe' : 'ignore', 'pipe'],
    });
  } catch {
    throw new Error('The isolated pilot Supabase command failed.');
  }
}

export function getPilotRuntimeStatus() {
  verifyPreparedPilot();
  const raw = runSupabase(['status', '--output', 'json'], { output: true });
  try {
    const status = JSON.parse(raw);
    validatePilotStatus(status);
    return status;
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error('The isolated pilot status is invalid.');
  }
}

export function getPilotStatus() {
  return validatePilotStatus(getPilotRuntimeStatus());
}

function safePrint(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function main() {
  const action = process.argv[2];
  if (!PILOT_ACTIONS.includes(action)) {
    throw new Error(`Usage: node scripts/local-pilot.mjs ${PILOT_ACTIONS.join('|')}`);
  }
  if (action === 'prepare') {
    const result = preparePilotLayout();
    safePrint({ prepared: true, migrationCount: result.migrationCount });
    return;
  }
  if (action === 'preflight') {
    const result = preflightPilot();
    safePrint({ ready: true, migrationCount: result.migrationCount });
    return;
  }
  if (action === 'start') {
    verifyPreparedPilot();
    assertLocalDockerSocket();
    let running;
    try {
      running = getPilotRuntimeStatus();
    } catch {
      // A missing status is expected before the first start. Occupied pilot
      // ports are checked below and stop a partial/ambiguous recovery.
    }
    if (running) {
      ensurePilotApplicationFiles(running);
      safePrint({
        started: false,
        alreadyRunning: true,
        ...validatePilotStatus(running),
      });
      return;
    }
    for (const port of Object.values(PILOT_PORTS)) assertPortAvailable(port);
    runSupabase(['start'], { timeout: 300_000 });
    const startedRuntime = getPilotRuntimeStatus();
    ensurePilotApplicationFiles(startedRuntime);
    safePrint({ started: true, ...validatePilotStatus(startedRuntime) });
    return;
  }
  const running = getPilotRuntimeStatus();
  ensurePilotApplicationFiles(running);
  safePrint({ running: true, ...validatePilotStatus(running) });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'The isolated pilot command failed.'}\n`,
    );
    process.exitCode = 1;
  }
}
