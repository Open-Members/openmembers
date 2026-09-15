// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  sign: vi.fn(),
  remove: vi.fn(),
  insert: vi.fn(),
  deleted: vi.fn(),
}));
vi.mock('@/core/access/admin', () => ({ requireAdmin: mocks.admin }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/core/storage/materials', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/storage/materials')>()),
  createMaterialSignedUploadUrl: mocks.sign,
  deleteMaterial: mocks.remove,
}));
import {
  createMaterialUploadUrlAction,
  listAttachmentsForLesson,
  finalizeAttachmentAction,
  deleteAttachment,
} from './attachments';
const lessonId = '11111111-1111-4111-8111-111111111111';
const valid = {
  lessonId,
  fileName: 'guide.pdf',
  mime: 'application/pdf',
  size: 100,
  path: `lessons/${lessonId}/guide.pdf`,
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.remove.mockResolvedValue(undefined);
  const supabase = {
    from: () => {
      let mode = 'read';
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        insert: (data: unknown) => {
          mode = 'insert';
          mocks.insert(data);
          return chain;
        },
        delete: () => {
          mode = 'delete';
          return chain;
        },
        single: async () => ({
          data: null,
          error: { message: 'write failed' },
        }),
        maybeSingle: async () =>
          mode === 'delete'
            ? mocks.deleted()
            : { data: { file_url: valid.path, sort_order: 1 }, error: null },
      };
      return chain;
    },
  };
  mocks.admin.mockResolvedValue({ supabase });
  mocks.deleted.mockResolvedValue({ data: null, error: null });
});
it('requires administrator authority before issuing uploads', async () => {
  mocks.admin.mockRejectedValue(new Error('Forbidden'));
  await expect(createMaterialUploadUrlAction(valid)).rejects.toThrow(
    'Forbidden',
  );
  expect(mocks.sign).not.toHaveBeenCalled();
});
it('rejects malformed metadata without issuing an upload', async () => {
  for (const change of [
    { size: -1 },
    { size: 26 * 1024 * 1024 },
    { lessonId: '../other' },
    { mime: 'text/html' },
    { fileName: '../guide.pdf' },
  ]) {
    expect(
      await createMaterialUploadUrlAction({ ...valid, ...change }),
    ).toEqual({ error: 'materialInvalid' });
  }
  expect(mocks.sign).not.toHaveBeenCalled();
});
it('returns a stable upload code without exposing provider errors', async () => {
  mocks.sign.mockRejectedValue(new Error('provider secret detail'));
  expect(await createMaterialUploadUrlAction(valid)).toEqual({
    error: 'uploadFailed',
  });
});
it('distinguishes an attachment read failure from an empty list', async () => {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({
      data: null,
      error: new Error('database unavailable'),
    }),
  };
  mocks.admin.mockResolvedValueOnce({
    supabase: { from: vi.fn().mockReturnValue(query) },
  });
  await expect(listAttachmentsForLesson(lessonId)).rejects.toThrow(
    'loadFailed',
  );
});
it('does not delete a referenced file when finalization is invalid', async () => {
  expect(
    await finalizeAttachmentAction({ ...valid, mime: 'text/html' }),
  ).toHaveProperty('error');
  expect(
    await finalizeAttachmentAction({
      ...valid,
      path: 'lessons/other/guide.pdf',
    }),
  ).toHaveProperty('error');
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
});
it('keeps uploaded bytes and returns a safe code when persistence fails', async () => {
  expect(await finalizeAttachmentAction(valid)).toEqual({
    error: 'operationFailed',
  });
  expect(mocks.insert).toHaveBeenCalledOnce();
  expect(mocks.remove).not.toHaveBeenCalled();
});
it('requires an affected row before deleting bytes', async () => {
  expect(await deleteAttachment('attachment')).toHaveProperty('error');
  expect(mocks.remove).not.toHaveBeenCalled();
  mocks.deleted.mockResolvedValue({ data: { id: 'attachment' }, error: null });
  expect(await deleteAttachment('attachment')).toEqual({ success: true });
  expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(valid.path);
});
