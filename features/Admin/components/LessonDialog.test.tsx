import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/core/i18n/locales/en/adminContent.json';
import type { AdminLesson } from '@/features/Admin/courseContent';

const mocks = vi.hoisted(() => ({
  createLesson: vi.fn(),
  updateLesson: vi.fn(),
  deleteLesson: vi.fn(),
  listAttachments: vi.fn(),
  toast: {
    success: vi.fn(),
    danger: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/features/Courses/actions', () => ({
  createLesson: mocks.createLesson,
  updateLesson: mocks.updateLesson,
  deleteLesson: mocks.deleteLesson,
}));
vi.mock('@/features/Admin/attachments', () => ({
  listAttachmentsForLesson: mocks.listAttachments,
  createMaterialUploadUrlAction: vi.fn(),
  finalizeAttachmentAction: vi.fn(),
  deleteAttachment: vi.fn(),
}));
vi.mock('./VideoUpload', () => ({ VideoUpload: () => null }));
vi.mock('@/shared/components/ui/ImageUpload', () => ({
  ImageUpload: () => null,
}));
vi.mock('@/core/storage/actions', () => ({
  createSignedUploadUrlAction: vi.fn(),
}));
vi.mock('@/shared/lib/toast', () => ({ appToast: mocks.toast }));

import { LessonDialog } from './LessonDialog';

const savedVideoLesson: AdminLesson = {
  id: 'lesson-1',
  moduleId: 'module-1',
  title: 'Authored video lesson',
  slug: 'authored-video-lesson',
  contentType: 'video',
  description: 'Authored description',
  youtubeVideoId: 'dQw4w9WgXcQ',
  videoProvider: 'youtube',
  videoExternalId: 'dQw4w9WgXcQ',
  videoHash: null,
  textContent: null,
  durationSeconds: 525,
  sortOrder: 0,
  isPublished: true,
  isFreePreview: false,
  ebookCoverUrl: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.listAttachments.mockResolvedValue([]);
  mocks.updateLesson.mockResolvedValue({ success: true });
});

afterEach(cleanup);

it('preserves the saved lesson type and media when editing an ebook course', async () => {
  render(
    <NextIntlClientProvider locale="en" messages={{ adminContent: en }}>
      <LessonDialog
        mode="edit"
        moduleId="module-1"
        courseSlug="course"
        courseContentFormat="ebook"
        lesson={savedVideoLesson}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    </NextIntlClientProvider>,
  );

  fireEvent.click(screen.getByRole('button', { name: en.save }));

  await waitFor(() => expect(mocks.updateLesson).toHaveBeenCalledOnce());
  const [, formData] = mocks.updateLesson.mock.calls[0] as [string, FormData];
  expect(formData.get('contentType')).toBe('video');
  expect(formData.get('videoProvider')).toBe('youtube');
  expect(formData.get('videoExternalId')).toBe('dQw4w9WgXcQ');
  expect(formData.get('durationSeconds')).toBe('525');
});
