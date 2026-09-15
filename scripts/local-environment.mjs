import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export const cliPath = path.join(projectRoot, 'node_modules/supabase/dist/supabase.js');
export const cliEnv = { ...process.env, SUPABASE_TELEMETRY_DISABLED: '1', DO_NOT_TRACK: '1', SUPABASE_ACCESS_TOKEN: '' };

export function assertLocalProject() {
  const config = readFileSync(path.join(projectRoot, 'supabase/config.toml'), 'utf8');
  if (!/^project_id\s*=\s*"openmembers"$/m.test(config) || !/^port\s*=\s*55432$/m.test(config)) {
    throw new Error('This command only supports the Open Members local project on its documented ports.');
  }
  if (existsSync(path.join(projectRoot, 'supabase/.temp/project-ref'))) {
    throw new Error('Refusing local demo operations in a project linked to a remote database.');
  }
  const dockerHost = process.env.DOCKER_HOST || execFileSync('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'], { timeout: 5000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  if (!dockerHost.startsWith('unix://')) {
    throw new Error('A local Docker socket is required.');
  }
}

export function validateLocalStatus(status) {
  for (const [key, port] of [['API_URL', '55431'], ['DB_URL', '55432'], ['INBUCKET_URL', '55434']]) {
    const url = new URL(status[key]);
    const protocols = key === 'DB_URL' ? ['postgres:', 'postgresql:'] : ['http:'];
    if (!protocols.includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.port !== port) {
      throw new Error(`Refusing non-local or unexpected ${key}.`);
    }
  }
  if (!status.ANON_KEY || !status.SERVICE_ROLE_KEY) throw new Error('Local Supabase keys are unavailable.');
  return status;
}

export function getLocalStatus() {
  assertLocalProject();
  let output;
  try {
    output = execFileSync(process.execPath, [cliPath, 'status', '--output', 'json'], {
      cwd: projectRoot, env: cliEnv, timeout: 20000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    throw new Error('Local Supabase is unavailable. Run npm run db:start first.');
  }
  return validateLocalStatus(JSON.parse(output));
}

export function localAppEnv(status, port = '3000') {
  const env = { ...process.env };
  // The local runner deliberately does not inherit provider credentials.
  const templateKeys = [...readFileSync(path.join(projectRoot, '.env.example'), 'utf8').matchAll(/^([A-Z][A-Z0-9_]+)=/gm)].map(match => match[1]);
  const legacyKeys = ['BREVO_API_KEY', 'BREVO_SENDER_EMAIL', 'BREVO_SENDER_NAME', 'STRIPE_PRICE_MONTHLY', 'STRIPE_PRICE_ANNUAL', 'NEXT_PUBLIC_VAPID_PUBLIC_KEY'];
  for (const key of new Set([...Object.keys(env), ...templateKeys, ...legacyKeys])) {
    if (/^(STRIPE_|RESEND_|BREVO_|R2_|SENTRY_|NEXT_PUBLIC_SENTRY_|NEXT_PUBLIC_GA4_|NEXT_PUBLIC_META_|NEXT_PUBLIC_VAPID_|AI_GATEWAY_|EMAIL_TRANSPORT|MAILPIT_|COURSE_CHAT_ENABLED|CRON_SECRET|SEND_EMAIL_HOOK_SECRET|CERTIFICATE_IMAGE_ALLOWED_ORIGINS)/.test(key)) env[key] = '';
  }
  return {
    ...env, OAUTH_PROVIDERS: '', EMAIL_TRANSPORT: 'mailpit', MAILPIT_URL: status.INBUCKET_URL, COURSE_CHAT_ENABLED: 'false', NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_SITE_URL: `http://localhost:${port}`,
    AUTH_ALLOWED_ORIGINS: 'http://localhost:3000,http://localhost:3101',
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY, SUPABASE_INTERNAL_URL: '', OPENMEMBERS_INTERNAL_URL: '', DATABASE_URL: status.DB_URL, DATABASE_POOL_URL: status.DB_URL,
  };
}
