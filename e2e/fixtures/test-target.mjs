const TARGETS = Object.freeze({
  e5: Object.freeze({
    name: 'e5',
    appOrigin: 'http://localhost:3101',
    apiOrigin: 'http://127.0.0.1:55431',
    mailboxOrigin: 'http://127.0.0.1:55434',
  }),
  pilot: Object.freeze({
    name: 'pilot',
    appOrigin: 'http://localhost:3201',
    apiOrigin: 'http://127.0.0.1:56431',
    mailboxOrigin: 'http://127.0.0.1:56434',
  }),
});

function validCredential(value) {
  return typeof value === 'string' && /^[A-Za-z0-9._-]+$/u.test(value);
}

export function browserTestTarget(env = process.env) {
  const name = env.OPENMEMBERS_BROWSER_TEST_TARGET ?? 'e5';
  if (!Object.hasOwn(TARGETS, name)) {
    throw new Error('Browser tests require the documented e5 or pilot target.');
  }
  return TARGETS[name];
}

export function assertBrowserTestEnvironment(env, baseURL) {
  const target = browserTestTarget(env);
  if (
    env.OPENMEMBERS_LOCAL_BROWSER_TEST !== '1'
    || env.NEXT_PUBLIC_SITE_URL !== target.appOrigin
    || env.NEXT_PUBLIC_SUPABASE_URL !== target.apiOrigin
    || !validCredential(env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    || !validCredential(env.SUPABASE_SERVICE_ROLE_KEY)
    || baseURL !== target.appOrigin
  ) {
    throw new Error('Browser request identities require the guarded Open Members local test runner.');
  }
  return target;
}
