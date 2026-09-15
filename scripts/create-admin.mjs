import { createClient } from '@supabase/supabase-js';
import { getLocalStatus } from './local-environment.mjs';

try {
  const email = process.argv[2]?.trim().toLowerCase();
  const password = process.env.OPENMEMBERS_ADMIN_PASSWORD;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || process.argv.length !== 3) throw new Error('Usage: npm run admin:create -- you@example.test');
  if (!password || password.length < 12) throw new Error('Set OPENMEMBERS_ADMIN_PASSWORD (at least 12 characters) for this process.');
  const status = getLocalStatus();
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { count, error: countError } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'super_admin');
  if (countError) throw new Error(countError.message);
  if (count !== 0) throw new Error('A super administrator already exists. Use the authenticated administrator workflow.');
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: 'Installation administrator' } });
  if (error || !data.user) throw new Error(error?.message ?? 'Account creation failed.');
  const { error: profileError } = await admin.from('profiles').update({ role: 'super_admin' }).eq('id', data.user.id);
  if (profileError) throw new Error('Account was created as a regular user; administrator provisioning failed.');
  console.log(`Local administrator created: ${email}. Password was not printed or stored in a file.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
