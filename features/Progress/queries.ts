import { createClient } from '@/core/supabase/client';

/**
 * Returns the set of YYYY-MM-DD strings where the user had at least one
 * practice session in the given year/month (1-indexed).
 */
export async function fetchPracticeDays(
  userId: string,
  year: number,
  month: number,
): Promise<Set<string>> {
  const supabase = createClient();

  // First day of the month, last day of the month
  const from = new Date(year, month - 1, 1).toISOString();
  const to = new Date(year, month, 1).toISOString(); // exclusive upper bound

  const { data } = await supabase
    .from('xp_events')
    .select('created_at')
    .eq('user_id', userId)
    .eq('reason', 'practice_session')
    .gte('created_at', from)
    .lt('created_at', to);

  const days = new Set<string>();
  for (const row of data ?? []) {
    // Extract YYYY-MM-DD in UTC (matches streak engine which stores UTC dates)
    const d = new Date(row.created_at);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    days.add(key);
  }
  return days;
}
