import 'server-only';
import type { createAdminClient } from './admin';

type AuthAdmin = Pick<ReturnType<typeof createAdminClient>['auth']['admin'], 'getUserById'>;

export class AuthUserLookupError extends Error {
  constructor() {
    super('AUTH_USER_LOOKUP_FAILED');
    this.name = 'AuthUserLookupError';
  }
}

/** Read only the accounts needed by an authorized server-side operation. */
export async function getAuthEmailsByIds(
  authAdmin: AuthAdmin,
  ids: readonly string[],
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(ids)];
  const emails = new Map<string, string>();
  try {
    for (let index = 0; index < uniqueIds.length; index += 5) {
      const batch = await Promise.all(uniqueIds.slice(index, index + 5).map(async (id) => {
        const { data, error } = await authAdmin.getUserById(id);
        if (error || !data?.user || data.user.id !== id) throw new AuthUserLookupError();
        return [id, data.user.email ?? ''] as const;
      }));
      for (const [id, email] of batch) emails.set(id, email);
    }
  } catch {
    throw new AuthUserLookupError();
  }
  return emails;
}
