import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps, ReactNode } from 'react';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import en from '@/core/i18n/locales/en/learningMedia.json';
import pt from '@/core/i18n/locales/pt/learningMedia.json';
import es from '@/core/i18n/locales/es/learningMedia.json';
import { R2VideoPlayer } from './R2VideoPlayer';
import { EbookReader } from './EbookReader';
import { EbookLibrary } from './EbookLibrary';

const mocks = vi.hoisted(() => ({ save: vi.fn(), danger: vi.fn() }));
vi.mock('@/features/Progress/actions', () => ({ setLessonCompleted: mocks.save }));
vi.mock('@/shared/lib/toast', () => ({ appToast: { danger: mocks.danger } }));
vi.mock('@/shared/components/student/HeroBanner', () => ({
  HeroBanner: ({ title, eyebrow, primaryCta }: { title: string; eyebrow: string; primaryCta?: { href: string; label: string } }) => (
    <header><h1>{title}</h1><p>{eyebrow}</p>{primaryCta && <a href={primaryCta.href}>{primaryCta.label}</a>}</header>
  ),
}));

const catalogs = { en, pt, es };
function wrapper(locale: keyof typeof catalogs) {
  return function LocaleProvider({ children }: { children: ReactNode }) {
    return <NextIntlClientProvider locale={locale} messages={{ learningMedia: catalogs[locale] }} timeZone="UTC">{children}</NextIntlClientProvider>;
  };
}
const readerProps: ComponentProps<typeof EbookReader> = {
  course: { slug: 'authored-course', title: 'Authored course' },
  lesson: { id: 'test-lesson', title: 'Authored lesson', description: 'Authored description', isCompleted: false },
  attachment: null,
  modules: [],
};
const libraryCourse: ComponentProps<typeof EbookLibrary>['course'] = {
  id: 'test-course', slug: 'authored-course', title: 'Authored course',
  shortDescription: null, description: null, thumbnailLandscapeUrl: null, thumbnailPortraitUrl: null,
  heroBannerUrl: null, trailerYoutubeId: null, heroOverlayOpacity: 50, heroShowText: true,
  checkoutUrl: null, isAccessible: true, progressPercent: 0, totalLessons: 1, completedLessons: 0,
  durationMinutes: 2, isNew: false, isFeatured: false, contentFormat: 'ebook',
  certificateAvailable: false, isCompleted: false, firstLessonSlug: 'authored-lesson', resumeLessonSlug: null, related: [],
  instructor: { id: 'instructor', slug: 'instructor', name: 'Authored instructor', bio: null, headline: null, portraitUrl: null },
  modules: [{ id: 'test-module', title: 'Authored module', description: null, lessons: [{
    id: 'test-lesson', slug: 'authored-lesson', title: 'Authored lesson', durationSeconds: 60,
    isCompleted: false, isDripLocked: false, isFreePreview: false, dripUnlockDate: null, coverUrl: null,
  }] }],
};

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn());
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = vi.fn(() => 'blob:local-test-pdf');
    static revokeObjectURL = vi.fn();
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe.each(['en', 'pt', 'es'] as const)('Learning media in %s', (locale) => {
  const copy = catalogs[locale];
  const t = createTranslator({ locale, messages: copy });

  it('localizes custom player controls, position and decimal speed while preserving playback values', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ url: 'https://media.example.test/video.mp4' })));
    const view = render(<R2VideoPlayer lessonId="test-lesson" title="Authored lesson" durationSeconds={120} resumePositionSeconds={45} />, { wrapper: wrapper(locale) });
    expect(screen.getByRole('status', { name: copy.video.loading })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: t('video.resumeFrom', { time: '0:45' }) })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.video.startOver })).toBeInTheDocument();
    expect(screen.getByText('Authored lesson')).toBeInTheDocument();
    const video = view.container.querySelector('video')!;
    fireEvent.play(video);
    expect(screen.getByRole('button', { name: copy.video.pause })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.video.enterFullscreen })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: copy.video.seek })).toHaveAttribute('aria-valuetext', t('video.seekValue', { current: '0:00', total: '2:00' }));
    fireEvent.click(screen.getByRole('button', { name: copy.video.mute }));
    expect(screen.getByRole('button', { name: copy.video.unmute })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: copy.video.speed }));
    expect(screen.getByRole('menuitemradio', { name: copy.video.normalSpeed })).toHaveAttribute('aria-checked', 'true');
    const rateLabel = t('video.rate', { rate: new Intl.NumberFormat(locale).format(0.75) });
    fireEvent.click(screen.getByRole('menuitemradio', { name: rateLabel }));
    expect(screen.getByRole('button', { name: copy.video.speed })).toHaveTextContent(rateLabel);
    expect(video.playbackRate).toBe(0.75);
    expect(localStorage.getItem('openmembers:player:rate')).toBe('0.75');
    fireEvent.pause(video);
    expect(screen.getByRole('button', { name: copy.video.resume })).toBeInTheDocument();
    fireEvent.error(video);
    expect(screen.getByRole('alert')).toHaveTextContent(copy.video.errors.failed);
  });

  it.each([[401, 'unauthenticated'], [403, 'forbidden'], [503, 'unavailable'], [502, 'failed']] as const)('replaces status %s API messages with a localized player error', async (status, key) => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: 'PRIVATE provider diagnostic' }), { status }));
    render(<R2VideoPlayer lessonId="test-lesson" />, { wrapper: wrapper(locale) });
    expect(await screen.findByRole('alert')).toHaveTextContent(copy.video.errors[key]);
    expect(document.body).not.toHaveTextContent('PRIVATE');
  });

  it('localizes library plurals and CTAs while preserving authored content and URLs', () => {
    const view = render(<EbookLibrary course={libraryCourse} />, { wrapper: wrapper(locale) });
    expect(screen.getByText(t('library.ebooks', { count: 1 }))).toBeInTheDocument();
    expect(screen.getByText(t('library.withInstructor', { name: 'Authored instructor' }))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.library.start })).toHaveAttribute('href', '/courses/authored-course/authored-lesson');
    view.rerender(<EbookLibrary course={{ ...libraryCourse, totalLessons: 2, isAccessible: false }} />);
    expect(screen.getByText(t('library.ebooks', { count: 2 }))).toBeInTheDocument();
    expect(screen.getByText(copy.library.enrollHelp)).toBeInTheDocument();
    expect(screen.getByText('Authored module')).toBeInTheDocument();
  });

  it('keeps reading incomplete for action and network errors and permits a successful retry', async () => {
    mocks.save.mockResolvedValueOnce({ error: 'saveProgressFailed' }).mockRejectedValueOnce(new Error('PRIVATE save failure')).mockResolvedValueOnce({ success: true });
    render(<EbookReader {...readerProps} />, { wrapper: wrapper(locale) });
    expect(screen.getByText(copy.reader.noPdf)).toBeInTheDocument();
    expect(screen.getByText('Authored description')).toBeInTheDocument();
    for (let attempt = 0; attempt < 2; attempt++) {
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: copy.reader.markRead })); });
      expect(mocks.danger).toHaveBeenLastCalledWith(copy.reader.saveFailedTitle, copy.reader.saveFailed);
      expect(screen.getByRole('button', { name: copy.reader.markRead })).toBeEnabled();
      expect(screen.queryByRole('button', { name: copy.reader.read })).not.toBeInTheDocument();
    }
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: copy.reader.markRead })); });
    expect(screen.getByRole('button', { name: copy.reader.read })).toBeDisabled();
    expect(document.body).not.toHaveTextContent('PRIVATE');
  });

  it.each([
    [403, 'application/json'],
    [200, 'application/json'],
  ])('does not embed raw API content (status %s, %s)', async (status, contentType) => {
    vi.mocked(fetch).mockResolvedValue(new Response('PRIVATE diagnostic', { status, headers: { 'Content-Type': contentType } }));
    render(<EbookReader {...readerProps} attachment={{ id: 'test-pdf', fileName: 'Authored file.pdf' }} />, { wrapper: wrapper(locale) });
    expect(screen.getByRole('status')).toHaveTextContent(copy.reader.loading);
    expect(await screen.findByRole('alert')).toHaveTextContent(copy.reader.loadFailed);
    expect(document.querySelector('iframe')).toBeNull();
    expect(document.body).not.toHaveTextContent('PRIVATE');
  });

  it('does not fetch or mount an embedded PDF on mobile, retaining explicit download controls', () => {
    vi.mocked(window.matchMedia).mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList);
    render(<EbookReader {...readerProps} attachment={{ id: 'mobile-pdf', fileName: 'Authored file.pdf' }} />, { wrapper: wrapper(locale) });
    expect(screen.getByRole('button', { name: copy.reader.downloadPdf })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    expect(document.querySelector('iframe')).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});

it('unmounts the reader and revokes its Blob when the viewport becomes mobile', async () => {
  let resize!: () => void;
  const query = { matches: true, addEventListener: vi.fn((_event: string, callback: () => void) => { resize = callback; }), removeEventListener: vi.fn() };
  vi.mocked(window.matchMedia).mockReturnValue(query as unknown as MediaQueryList);
  vi.mocked(fetch).mockResolvedValue(new Response('%PDF-1.4 fixture', { headers: { 'Content-Type': 'application/pdf' } }));
  render(<EbookReader {...readerProps} attachment={{ id: 'resizable-pdf', fileName: 'Authored file.pdf' }} />, { wrapper: wrapper('pt') });
  expect(await screen.findByTitle('Authored lesson')).toBeInTheDocument();
  await act(async () => { query.matches = false; resize(); });
  expect(document.querySelector('iframe')).toBeNull();
  expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
});

it('embeds only verified PDF bytes and revokes the object URL when a file changes or the reader closes', async () => {
  vi.mocked(fetch).mockImplementation(async () => new Response('%PDF-1.4 local fixture', { headers: { 'Content-Type': 'application/pdf; charset=binary' } }));
  const props = { ...readerProps, attachment: { id: 'first-pdf', fileName: 'Authored file.pdf' } };
  const view = render(<EbookReader {...props} />, { wrapper: wrapper('pt') });
  expect(await screen.findByTitle('Authored lesson')).toHaveAttribute('src', 'blob:local-test-pdf');
  expect(fetch).toHaveBeenCalledWith('/api/attachments/first-pdf?inline=1', expect.objectContaining({ credentials: 'include' }));
  const firstSignal = vi.mocked(fetch).mock.calls[0][1]?.signal;
  view.rerender(<EbookReader {...props} attachment={{ id: 'second-pdf', fileName: 'Another file.pdf' }} />);
  expect(firstSignal?.aborted).toBe(true);
  expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(2));
  view.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
});

it('aborts pending reader requests and never creates an object URL after unmount', async () => {
  let resolve!: (response: Response) => void;
  vi.mocked(fetch).mockImplementation(() => new Promise((done) => { resolve = done; }));
  const view = render(<EbookReader {...readerProps} attachment={{ id: 'pending-pdf', fileName: 'Pending.pdf' }} />, { wrapper: wrapper('es') });
  const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
  view.unmount();
  expect(signal?.aborted).toBe(true);
  await act(async () => { resolve(new Response('%PDF-1.4', { headers: { 'Content-Type': 'application/pdf' } })); });
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(mocks.danger).not.toHaveBeenCalled();
});
