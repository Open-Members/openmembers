import { test, expect, type Page } from './fixtures/database-test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import comments from '../core/i18n/locales/en/comments.json';
import { browserTestTarget } from './fixtures/test-target.mjs';

const { apiOrigin: localApi } = browserTestTarget();
const lessonId = '40000000-0000-4000-8000-000000000001';
const studentId = '10000000-0000-4000-8000-000000000002';
const lessonPath = '/courses/open-members-demo/welcome';

function localAdmin() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL !== localApi || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Comment browser tests require the guarded local runner.');
  }
  return createClient(localApi, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill('OpenMembers-local-2026!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test('student comments and replies, then an administrator moderates the persisted discussion', async ({ page, context }) => {
  const admin = localAdmin();
  const marker = `Development comment ${randomUUID()}`;
  const reply = `${marker} reply`;
  const errors: string[] = [];
  // A textarea's current value can match getByText before submission finishes.
  const renderedComment = (content: string) => page.getByText(content, { exact: true }).and(page.locator('p'));
  page.on('pageerror', error => errors.push(error.message));
  try {
    await login(page, 'student@example.test');
    await page.goto(lessonPath);
    const commentInput = page.getByRole('textbox', { name: comments.commentLabel, exact: true });
    await commentInput.fill(marker);
    await page.getByRole('button', { name: 'Comment', exact: true }).click();
    await expect(commentInput).toHaveValue('');
    const commentText = renderedComment(marker);
    await expect(commentText).toBeVisible();
    const studentComment = commentText.locator('..');
    await expect(studentComment.getByRole('button', { name: 'Pin', exact: true })).toHaveCount(0);
    let commentId = '';
    await expect.poll(async () => {
      const stored = await admin.from('lesson_comments').select('id,user_id,is_pinned')
        .eq('lesson_id', lessonId).eq('content', marker).maybeSingle();
      expect(stored.error).toBeNull();
      commentId = stored.data?.id ?? '';
      return stored.data;
    }).toMatchObject({ id: expect.any(String), user_id: studentId, is_pinned: false });

    await studentComment.hover();
    await studentComment.getByRole('button', { name: 'Reply', exact: true }).click();
    const replyInput = page.getByRole('textbox', { name: comments.replyLabel, exact: true });
    await replyInput.fill(reply);
    await replyInput.locator('..').getByRole('button', { name: 'Reply', exact: true }).click();
    await expect(replyInput).toHaveCount(0);
    const replyText = renderedComment(reply);
    await expect(replyText).toBeVisible();
    await expect.poll(async () => {
      const storedReply = await admin.from('lesson_comments').select('parent_id,user_id')
        .eq('lesson_id', lessonId).eq('content', reply).maybeSingle();
      expect(storedReply.error).toBeNull();
      return storedReply.data;
    }).toEqual({ parent_id: commentId, user_id: studentId });
    await replyText.locator('..').hover();
    await replyText.locator('..').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(replyText).toHaveCount(0);
    await expect.poll(async () => {
      const removedReply = await admin.from('lesson_comments').select('id')
        .eq('lesson_id', lessonId).eq('content', reply);
      expect(removedReply.error).toBeNull();
      return removedReply.data;
    }).toEqual([]);

    await context.clearCookies();
    await login(page, 'admin@example.test');
    await page.goto(lessonPath);
    const moderated = renderedComment(marker).locator('..');
    await expect(moderated).toBeVisible();
    await moderated.hover();
    await moderated.getByRole('button', { name: 'Pin', exact: true }).click();
    await expect(moderated.getByText('Pinned', { exact: true })).toBeVisible();
    await expect.poll(async () => {
      const pinned = await admin.from('lesson_comments').select('is_pinned').eq('id', commentId).maybeSingle();
      expect(pinned.error).toBeNull();
      return pinned.data?.is_pinned;
    }).toBe(true);
    await page.reload();
    await expect(moderated.getByText('Pinned', { exact: true })).toBeVisible();
    await moderated.hover();
    await moderated.getByRole('button', { name: 'Unpin', exact: true }).click();
    await expect(moderated.getByText('Pinned', { exact: true })).toHaveCount(0);
    await expect.poll(async () => {
      const unpinned = await admin.from('lesson_comments').select('is_pinned').eq('id', commentId).maybeSingle();
      expect(unpinned.error).toBeNull();
      return unpinned.data?.is_pinned;
    }).toBe(false);
    await moderated.hover();
    await moderated.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(renderedComment(marker)).toHaveCount(0);
    await expect.poll(async () => {
      const deleted = await admin.from('lesson_comments').select('id').eq('id', commentId);
      expect(deleted.error).toBeNull();
      return deleted.data;
    }).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    // Only this run's fictitious markers, within the seeded lesson.
    const cleaned = await admin.from('lesson_comments').delete()
      .eq('lesson_id', lessonId).in('content', [marker, reply]);
    expect(cleaned.error).toBeNull();
  }
});
