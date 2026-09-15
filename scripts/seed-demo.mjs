import { createClient } from '@supabase/supabase-js';
import { getLocalStatus } from './local-environment.mjs';
import { provisionDemoData } from './demo-data.mjs';

const status = getLocalStatus();
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
await provisionDemoData(admin);
console.log('Local demo ready: 6 accounts, 2 courses, 4 lessons, 3 enrollments, 2 private attachments.');
console.log('Demo account details are in docs/development/local-database.md. No external email was sent.');
