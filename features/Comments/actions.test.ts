// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  client: vi.fn(), admin: vi.fn(), user: vi.fn(), access: vi.fn(),
  notify: vi.fn(), revalidate: vi.fn(),
}));
vi.mock('@/core/supabase/server', () => ({ createClient: mocks.client }));
vi.mock('@/core/supabase/admin', () => ({ createAdminClient: mocks.admin }));
vi.mock('@/core/access/server', () => ({ isUserLessonAccessible: mocks.access }));
vi.mock('@/features/Notifications/engagement-events', () => ({ notifyCommentReply: mocks.notify }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
import { addComment, deleteComment, fetchComments, pinComment } from './actions';

const userId = '10000000-0000-4000-8000-000000000001';
const lessonId = '20000000-0000-4000-8000-000000000001';
const commentId = '30000000-0000-4000-8000-000000000001';
const parentId = '30000000-0000-4000-8000-000000000002';
const otherUserId = '10000000-0000-4000-8000-000000000002';

type Result = { data: unknown; error: { message: string } | null };
function query(result: Result) {
  return {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(), insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(), delete: vi.fn().mockReturnThis(),
    single: vi.fn(async () => result), maybeSingle: vi.fn(async () => result),
    then: (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
  };
}
let profile: Result;
let comment: Result;
let write: Result;
let authors: Result;
let profileQuery: ReturnType<typeof query>;
let readQuery: ReturnType<typeof query>;
let writeQuery: ReturnType<typeof query>;
let authorQuery: ReturnType<typeof query>;
let from: ReturnType<typeof vi.fn>;

function form(extra: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ lessonId, content: 'A fictitious discussion.', ...extra })) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.user.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  mocks.access.mockResolvedValue(true);
  profile = { data: { role: 'user', status: 'active' }, error: null };
  comment = { data: { id: commentId, user_id: userId, is_pinned: false }, error: null };
  write = { data: { id: commentId }, error: null };
  authors = { data: [], error: null };
  profileQuery = query(profile);
  readQuery = query(comment);
  writeQuery = query(write);
  authorQuery = query(authors);
  from = vi.fn((table: string) => {
    if (table === 'profiles') return profileQuery;
    if (table !== 'lesson_comments') throw new Error(`Unexpected table ${table}`);
    return {
      select: (...args: unknown[]) => readQuery.select(...args),
      insert: (...args: unknown[]) => writeQuery.insert(...args),
      update: (...args: unknown[]) => writeQuery.update(...args),
      delete: (...args: unknown[]) => writeQuery.delete(...args),
    };
  });
  mocks.client.mockResolvedValue({ auth: { getUser: mocks.user }, from });
  mocks.admin.mockReturnValue({ from: vi.fn(() => authorQuery) });
});
afterEach(() => vi.restoreAllMocks());

const mutations = [
  ['add', () => addComment(form())],
  ['delete', () => deleteComment(commentId)],
  ['pin', () => pinComment(commentId)],
] as const;

for (const [name, action] of mutations) {
  describe(`${name} comment authorization`, () => {
    it.each(['absent', 'error'] as const)('denies an %s Auth session before writing', async (state) => {
      mocks.user.mockResolvedValue({ data: { user: state === 'absent' ? null : { id: userId } }, error: state === 'error' ? new Error('Auth failed') : null });
      expect(await action()).toHaveProperty('error');
      expect(from).not.toHaveBeenCalled();
      expect(mocks.access).not.toHaveBeenCalled();
      expect(mocks.revalidate).not.toHaveBeenCalled();
    });
    it.each(['missing', 'suspended', 'error'] as const)('denies %s profiles without a comment operation', async (state) => {
      profile.data = state === 'missing' ? null : { role: 'super_admin', status: state === 'suspended' ? 'suspended' : 'active' };
      profile.error = state === 'error' ? { message: 'Profile failed' } : null;
      expect(await action()).toHaveProperty('error');
      expect(from.mock.calls.map(([table]) => table)).toEqual(['profiles']);
      expect(mocks.notify).not.toHaveBeenCalled();
      expect(mocks.revalidate).not.toHaveBeenCalled();
    });
  });
}

describe('add comment', () => {
  const invalidFields: Record<string, string>[] = [
    { lessonId: 'invalid' }, { parentId: 'invalid' }, { content: '' }, { content: 'x'.repeat(2001) },
  ];
  it.each(invalidFields)('rejects invalid fields before lesson access or insert', async (fields) => {
    expect(await addComment(form(fields))).toHaveProperty('error');
    expect(mocks.access).not.toHaveBeenCalled();
    expect(writeQuery.insert).not.toHaveBeenCalled();
  });
  it('rejects an inaccessible lesson without writes or notification', async () => {
    mocks.access.mockResolvedValue(false);
    expect(await addComment(form({ parentId }))).toEqual({ error: 'accessDenied' });
    expect(mocks.access).toHaveBeenCalledExactlyOnceWith(userId, lessonId);
    expect(writeQuery.insert).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it('takes the author from the session and prevents caller-supplied pin state', async () => {
    expect(await addComment(form({ userId: otherUserId, user_id: otherUserId, is_pinned: 'true' }))).toEqual({ success: true, data: { id: commentId } });
    expect(writeQuery.insert).toHaveBeenCalledExactlyOnceWith({ lesson_id: lessonId, user_id: userId, content: 'A fictitious discussion.', parent_id: null, is_pinned: false });
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.revalidate).toHaveBeenCalledWith('/');
  });
  it('notifies a reply only after a confirmed insert, using the persisted ID', async () => {
    await addComment(form({ parentId }));
    expect(writeQuery.insert).toHaveBeenCalledWith(expect.objectContaining({ parent_id: parentId }));
    expect(mocks.notify).toHaveBeenCalledExactlyOnceWith({ commentId });
    expect(writeQuery.single.mock.invocationCallOrder[0]).toBeLessThan(mocks.notify.mock.invocationCallOrder[0]);
  });
  it.each(['error', 'missing'] as const)('does not notify or revalidate when insertion is %s', async (state) => {
    write.data = null;
    write.error = state === 'error' ? { message: 'Constraint rejected reply' } : null;
    expect(await addComment(form({ parentId }))).toHaveProperty('error');
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});

describe('delete and pin persistence', () => {
  it.each([deleteComment, pinComment])('rejects invalid IDs before session or database work', async action => {
    expect(await action('invalid')).toHaveProperty('error');
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it('does not delete another author as a student', async () => {
    comment.data = { user_id: otherUserId };
    expect(await deleteComment(commentId)).toEqual({ error: 'accessDenied' });
    expect(writeQuery.delete).not.toHaveBeenCalled();
  });
  it('lets the owner delete a persisted row', async () => {
    expect(await deleteComment(commentId)).toEqual({ success: true });
    expect(writeQuery.delete).toHaveBeenCalledOnce();
    expect(writeQuery.eq).toHaveBeenCalledWith('id', commentId);
    expect(mocks.revalidate).toHaveBeenCalledWith('/');
  });
  it.each(['admin', 'super_admin'])('lets an active %s delete another author’s comment', async role => {
    profile.data = { role, status: 'active' };
    comment.data = { user_id: otherUserId };
    expect(await deleteComment(commentId)).toEqual({ success: true });
  });
  it.each(['user', 'staff', 'administrator'])('does not allow %s to pin, even their own comment', async role => {
    profile.data = { role, status: 'active' };
    expect(await pinComment(commentId)).toEqual({ error: 'accessDenied' });
    expect(from.mock.calls.map(([table]) => table)).toEqual(['profiles']);
    expect(writeQuery.update).not.toHaveBeenCalled();
  });
  it.each(['admin', 'super_admin'])('lets an active %s pin and unpin', async role => {
    profile.data = { role, status: 'active' };
    expect(await pinComment(commentId)).toEqual({ success: true, data: { isPinned: true } });
    expect(writeQuery.update).toHaveBeenLastCalledWith({ is_pinned: true });
    comment.data = { is_pinned: true };
    expect(await pinComment(commentId)).toEqual({ success: true, data: { isPinned: false } });
    expect(writeQuery.update).toHaveBeenLastCalledWith({ is_pinned: false });
  });
  for (const action of [deleteComment, pinComment]) {
    it.each(['missing', 'error'] as const)(`${action.name} rejects an unavailable comment (%s)`, async state => {
      profile.data = { role: 'admin', status: 'active' };
      comment.data = state === 'missing' ? null : { user_id: userId, is_pinned: false };
      comment.error = state === 'error' ? { message: 'Lookup failed' } : null;
      expect(await action(commentId)).toHaveProperty('error');
      expect(writeQuery.delete).not.toHaveBeenCalled();
      expect(writeQuery.update).not.toHaveBeenCalled();
    });
    it.each(['zero rows', 'error'] as const)(`${action.name} does not claim success with %s`, async state => {
      profile.data = { role: 'admin', status: 'active' };
      write.data = null;
      write.error = state === 'error' ? { message: 'Write failed' } : null;
      expect(await action(commentId)).toHaveProperty('error');
      expect(mocks.revalidate).not.toHaveBeenCalled();
      expect(mocks.notify).not.toHaveBeenCalled();
    });
  }
});

describe('read comments', () => {
  it.each(['signed out', 'inactive', 'auth error', 'profile error', 'denied'] as const)('does not fetch or expose authors when %s', async state => {
    if (state === 'signed out') mocks.user.mockResolvedValue({ data: { user: null }, error: null });
    if (state === 'auth error') mocks.user.mockResolvedValue({ data: { user: { id: userId } }, error: new Error('Auth failed') });
    if (state === 'inactive') profile.data = { role: 'user', status: 'suspended' };
    if (state === 'profile error') profile.error = { message: 'Read failed' };
    if (state === 'denied') mocks.access.mockResolvedValue(false);
    const error = state === 'signed out' || state === 'auth error' ? 'notAuthenticated' : 'accessDenied';
    expect(await fetchComments(lessonId)).toEqual({ error });
    expect(readQuery.select).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it('rejects an invalid lesson without a query', async () => {
    expect(await fetchComments('invalid')).toEqual({ error: 'invalidInput' });
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it.each(['error', 'empty'] as const)('does not create an admin client for an %s result', async state => {
    comment.data = state === 'empty' ? [] : null;
    comment.error = state === 'error' ? { message: 'Read failed' } : null;
    expect(await fetchComments(lessonId)).toEqual(state === 'error' ? { error: 'loadFailed' } : { data: [] });
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it('returns only public author fields and requests only authors of accessible comments', async () => {
    comment.data = [{ id: commentId, lesson_id: lessonId, user_id: otherUserId, parent_id: null, content: 'Fictitious.', is_pinned: false, created_at: '2026-09-11T12:00:00Z' }];
    authors.data = [{ id: otherUserId, display_name: 'Demo Author', avatar_url: null, email: 'private-fixture@example.test', role: 'super_admin', billing_address: 'Private fixture' }];
    expect(await fetchComments(lessonId)).toEqual({ data: [{ id: commentId, lessonId, userId: otherUserId, parentId: undefined, content: 'Fictitious.', isPinned: false, createdAt: '2026-09-11T12:00:00Z', userDisplayName: 'Demo Author', userAvatarUrl: undefined }] });
    expect(authorQuery.select).toHaveBeenCalledExactlyOnceWith('id, display_name, avatar_url');
    expect(authorQuery.in).toHaveBeenCalledExactlyOnceWith('id', [otherUserId]);
    expect(mocks.access.mock.invocationCallOrder[0]).toBeLessThan(mocks.admin.mock.invocationCallOrder[0]);
  });
  it('uses an anonymous fallback if an author projection is unavailable', async () => {
    comment.data = [{ id: commentId, user_id: otherUserId }];
    authors.data = null;
    authors.error = { message: 'Profiles unavailable' };
    expect(await fetchComments(lessonId)).toEqual({ data: [expect.objectContaining({ userDisplayName: null, userAvatarUrl: undefined })] });
  });
});


describe('localized error contracts', () => {
  it.each([
    [{ content: '' }, 'contentRequired'],
    [{ content: 'x'.repeat(2001) }, 'contentTooLong'],
    [{ lessonId: 'invalid' }, 'invalidInput'],
    [{ parentId: 'invalid' }, 'invalidInput'],
  ] as const)('returns a stable validation code for %o', async (fields, error) => {
    expect(await addComment(form(fields))).toEqual({ error });
    expect(writeQuery.insert).not.toHaveBeenCalled();
  });
  it.each([
    ['add', () => addComment(form()), 'saveFailed'],
    ['delete', () => deleteComment(commentId), 'deleteFailed'],
    ['pin', () => pinComment(commentId), 'pinFailed'],
    ['fetch', () => fetchComments(lessonId), 'loadFailed'],
  ] as const)('%s masks unexpected transport diagnostics', async (_name, action, error) => {
    mocks.client.mockRejectedValue(new Error('PRIVATE transport diagnostic'));
    expect(await action()).toEqual({ error });
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it.each([
    [() => addComment(form()), 'saveFailed'],
    [() => deleteComment(commentId), 'deleteFailed'],
    [() => pinComment(commentId), 'pinFailed'],
  ] as const)('masks database diagnostics instead of returning provider prose', async (action, error) => {
    profile.data = { role: 'admin', status: 'active' };
    write.error = { message: 'PRIVATE constraint diagnostic' };
    expect(await action()).toEqual({ error });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it('preserves an author explicitly named Anonymous', async () => {
    comment.data = [{ id: commentId, user_id: otherUserId }];
    authors.data = [{ id: otherUserId, display_name: 'Anonymous', avatar_url: null }];
    expect(await fetchComments(lessonId)).toEqual({ data: [expect.objectContaining({ userDisplayName: 'Anonymous' })] });
  });
});
