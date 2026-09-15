import { NextResponse } from 'next/server';
import { hasCourseChatConfiguration } from '@/core/config/capabilities.server';

/** All chat operations use the same decision as the lesson UI. */
export function courseChatUnavailableResponse(): NextResponse | null {
  return hasCourseChatConfiguration() ? null : NextResponse.json(
    { error: 'not_configured', message: 'Course chat is not enabled for this installation.' },
    { status: 503 },
  );
}
