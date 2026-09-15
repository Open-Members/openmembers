import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

/** Check authorization before constructing any service-role client. */
export function authorizeJob(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  const actual = createHash('sha256').update(request.headers.get('authorization') ?? '').digest();
  const expected = createHash('sha256').update(`Bearer ${secret}`).digest();
  if (!timingSafeEqual(actual, expected)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  return null;
}
