import 'server-only';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { IncompleteReadError, MAX_COMPLETE_READ_ROWS, READ_PAGE_SIZE } from './read-all';

/** Resolve the entire profile export without one Auth request per account. */
export async function readProfileAuthUsers(
  admin: Pick<SupabaseClient['auth']['admin'], 'listUsers'>,
  profileIds: readonly string[],
): Promise<Map<string, User>> {
  const required = new Set(profileIds);
  const matched = new Map<string, User>();
  const seen = new Set<string>();
  if (required.size > MAX_COMPLETE_READ_ROWS) throw new IncompleteReadError();
  let advertisedTotal: number | undefined;
  for (let page = 1; matched.size < required.size; page += 1) {
    // The installed Auth SDK truncates next/last page links to a single digit.
    // Increment directly and require a matching Auth record for every profile.
    const { data, error } = await admin.listUsers({ page, perPage: READ_PAGE_SIZE });
    if (error || !data || !Array.isArray(data.users) || data.users.length === 0 ||
        data.users.length > READ_PAGE_SIZE || seen.size + data.users.length > MAX_COMPLETE_READ_ROWS) {
      throw new IncompleteReadError();
    }
    const total = 'total' in data ? data.total : 0;
    // SDK defaults total to zero when pagination headers are unavailable.
    if (total > 0) {
      if (!Number.isSafeInteger(total) || (advertisedTotal !== undefined && advertisedTotal !== total) ||
          seen.size + data.users.length > total) throw new IncompleteReadError();
      advertisedTotal = total;
    }
    for (const user of data.users) {
      if (!user.id || seen.has(user.id)) throw new IncompleteReadError();
      seen.add(user.id);
      if (required.has(user.id)) matched.set(user.id, user);
    }
  }
  return matched;
}
