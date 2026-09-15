import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/core/supabase/server';
import { z } from 'zod';
import { rateLimit } from '@/core/rate-limit';
import { hasSupabaseConfiguration } from '@/core/config/env';

const PUSH_LIMIT = { maxRequests: 10, windowMs: 60_000 };

function rateLimited(userId: string, op: 'subscribe' | 'unsubscribe'): NextResponse | null {
  const rl = rateLimit(`push:${op}:${userId}`, PUSH_LIMIT);
  if (rl.success) return null;
  return NextResponse.json(
    { error: 'rate limit exceeded' },
    { status: 429, headers: { 'Retry-After': '60' } },
  );
}

export async function POST() {
  // No service worker, opt-in UI or sender ships in this release.
  return NextResponse.json(
    { error: 'not_available', message: 'Push delivery is not available in this version.' },
    { status: 503 },
  );
}

export async function DELETE(request: NextRequest) {
  // Keep withdrawal available for previously stored subscriptions.
  if (!hasSupabaseConfiguration()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limited = rateLimited(user.id, 'unsubscribe');
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const endpoint = z.string().url().max(2000).safeParse((body as Record<string, unknown>)?.endpoint);
  if (!endpoint.success) {
    return NextResponse.json({ error: 'Invalid endpoint' }, { status: 400 });
  }

  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('endpoint', endpoint.data);

  if (error) {
    return NextResponse.json({ error: 'Failed to remove subscription' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
