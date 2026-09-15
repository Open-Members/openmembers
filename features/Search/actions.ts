'use server';

import { createClient } from '@/core/supabase/server';
import { searchGlobal } from './queries.server';
import type { SearchResult } from './types';

/**
 * Thin server-action wrapper around `searchGlobal`. Reads the caller's user id
 * so access decisions are per-viewer. Unauthenticated calls return the public
 * course catalog only. Lesson metadata requires the shared lesson gate.
 */
export async function searchGlobalAction(query: string): Promise<SearchResult> {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    return await searchGlobal(query, error ? null : user?.id ?? null);
  } catch {
    return { query, courses: [], lessons: [], error: 'searchFailed' };
  }
}
