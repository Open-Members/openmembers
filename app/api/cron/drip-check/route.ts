import { NextResponse } from 'next/server';
import { authorizeJob } from '@/lib/jobs/auth';
import { runDripCheck } from '@/lib/jobs/drip';

export async function GET(request: Request) {
  const denied = authorizeJob(request);
  if (denied) return denied;
  try { return NextResponse.json(await runDripCheck()); }
  catch { return NextResponse.json({ error: 'drip_check_failed' }, { status: 500 }); }
}
