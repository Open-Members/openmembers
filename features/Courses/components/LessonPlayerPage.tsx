'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  PanelRightClose,
  PanelRightOpen,
  Play,
  X,
} from 'lucide-react';
import { VideoPlayer } from './VideoPlayer';
import { usePlayerHydrated, usePlayerPreference } from './player-preferences';
import { LessonSidebar } from './LessonSidebar';
import { MarkCompleteButton } from './MarkCompleteButton';
import { MobileLessonToggle } from './MobileLessonToggle';
import { LessonPlayerExtras } from './LessonPlayerExtras';
import { QuizRunner } from './QuizRunner';
import { CourseChatDrawer } from '@/features/CourseChat';
import { markLessonComplete, saveVideoPosition } from '@/features/Progress/actions';
import { useConfetti } from '@/shared/motion/useConfetti';
import { appToast } from '@/shared/lib/toast';
import type {
  LessonWithProgress,
  ModuleWithLessonsAndProgress,
} from '@/features/Courses/types';
import type { StudentQuiz } from '@/features/Quizzes/types';

export type LessonPlayerData = {
  lesson: LessonWithProgress;
  course: {
    id: string;
    title: string;
    slug: string;
    thumbnailLandscapeUrl: string | null;
    thumbnailPortraitUrl: string | null;
    heroBannerUrl: string | null;
  };
  modules: ModuleWithLessonsAndProgress[];
  prevLesson: { slug: string; title: string } | null;
  nextLesson: { slug: string; title: string } | null;
  isAccessible: boolean;
  isFreePreview: boolean;
  autoplayNextLesson: boolean;
  currentUserId: string;
  isAdmin: boolean;
  quiz: StudentQuiz | null;
  quizAttemptsUsed: number;
  quizAlreadyPassed: boolean;
};

const COUNTDOWN_SECONDS = 10;

const SIDEBAR_STORAGE_KEY = 'openmembers:lesson-sidebar-collapsed';

// Mark the lesson complete once the learner has watched this fraction of it.
const AUTO_COMPLETE_THRESHOLD = 0.9;

// Throttle the "save playback position" action. Every N seconds of real time,
// as long as the player has advanced at least N seconds of video, we push
// the current position to the server. Worst-case data loss on a hard crash
// is one window of playback.
const POSITION_SAVE_INTERVAL_MS = 5000;
const POSITION_SAVE_MIN_DELTA_S = 5;

// Don't resume inside the last N seconds of a lesson — feels like the video
// never restarts. Don't resume from the first N seconds either — barely
// worth it and can be confusing if the user expected to start over.
const RESUME_LOWER_BOUND_S = 30;
const RESUME_UPPER_MARGIN_S = 15;
const RESUME_REWIND_S = 3;

export function LessonPlayerPage(props: Parameters<typeof LessonPlayerSession>[0]) {
  return <LessonPlayerSession key={props.data.lesson.id} {...props} />;
}

function LessonPlayerSession({
  data,
  watermarkUrl = null,
  seekToSeconds,
  chatEnabled = false,
}: {
  data: LessonPlayerData;
  watermarkUrl?: string | null;
  chatEnabled?: boolean;
  /**
   * When set (from a `?t=<seconds>` query param — e.g. arriving from a
   * Course Chat citation), start the video at this position instead of
   * the user's saved progress. An explicit seek intent overrides the
   * resume heuristic.
   */
  seekToSeconds?: number;
}) {
  const {
    lesson,
    course,
    modules,
    prevLesson,
    nextLesson,
    autoplayNextLesson,
    currentUserId,
    isAdmin,
  } = data;

  const router = useRouter();
  const t = useTranslations('learning.lesson');
  const completion = useTranslations('learning.completion');
  const [sidebarPreference, setSidebarPreference] = usePlayerPreference(SIDEBAR_STORAGE_KEY, 'false');
  const sidebarCollapsed = sidebarPreference === 'true';
  const hydrated = usePlayerHydrated();

  // Autoplay countdown state (only active when autoplay pref is on and there's a next lesson)
  const [countdown, setCountdown] = useState<number | null>(null);
  const cancelledRef = useRef(false);

  const isCompleted = lesson.progress?.isCompleted ?? false;

  // Guards against firing markLessonComplete more than once per lesson mount.
  const autoCompletedRef = useRef(isCompleted);

  // Throttled playback-position save + final-save-on-hide bookkeeping.
  const lastSavedAtRef = useRef(0);
  const lastSavedPosRef = useRef(lesson.progress?.videoPositionSeconds ?? 0);
  const currentPosRef = useRef(0);

  // Decide whether to seek into the lesson on mount.
  const savedPosition = lesson.progress?.videoPositionSeconds ?? 0;
  const duration = lesson.durationSeconds ?? 0;
  const canResume =
    !isCompleted &&
    savedPosition >= RESUME_LOWER_BOUND_S &&
    (duration === 0 || savedPosition <= duration - RESUME_UPPER_MARGIN_S);

  // An explicit `?t=` seek (from a chat citation) always wins over the
  // resume heuristic. Clamp to [0, duration] when we know the duration
  // so a stale or malformed link can't overshoot the clip.
  const hasExplicitSeek = typeof seekToSeconds === 'number' && Number.isFinite(seekToSeconds);
  const clampedSeek = hasExplicitSeek
    ? Math.max(0, duration > 0 ? Math.min(seekToSeconds!, Math.max(0, duration - 1)) : seekToSeconds!)
    : null;
  const initialPositionSeconds =
    clampedSeek !== null
      ? clampedSeek
      : canResume
        ? Math.max(0, savedPosition - RESUME_REWIND_S)
        : 0;

  // Per-lesson state resets when the keyed session changes. A server refresh
  // can confirm or undo completion without interrupting the current countdown.
  useEffect(() => {
    autoCompletedRef.current = isCompleted;
  }, [isCompleted]);

  const fireConfetti = useConfetti();
  const triggerAutoComplete = useCallback(() => {
    if (autoCompletedRef.current) return;
    autoCompletedRef.current = true;
    void (async () => {
      let result;
      try {
        result = await markLessonComplete(lesson.id);
      } catch {
        autoCompletedRef.current = false;
        return;
      }
      if (result && 'error' in result && result.error) {
        // Allow a retry on the next threshold crossing if the save failed.
        autoCompletedRef.current = false;
        return;
      }
      // Auto-complete via video end deserves the same celebration as
      // the explicit "Mark complete" click — otherwise students who
      // finish naturally never see it. Three-burst variant when this
      // closes out the whole course.
      if (result && 'courseJustCompleted' in result && result.courseJustCompleted) {
        fireConfetti({ origin: { x: 0.5, y: 0.6 }, particleCount: 140 });
        setTimeout(
          () => fireConfetti({ origin: { x: 0.2, y: 0.7 }, particleCount: 90 }),
          220,
        );
        setTimeout(
          () => fireConfetti({ origin: { x: 0.8, y: 0.7 }, particleCount: 90 }),
          440,
        );
        appToast.success(
          completion('courseTitle'),
          completion('courseMessage'),
        );
      }
      router.refresh();
    })();
  }, [lesson.id, router, fireConfetti, completion]);

  const handleVideoProgress = useCallback(
    (currentSeconds: number, providerDuration: number) => {
      currentPosRef.current = currentSeconds;

      // Auto-complete threshold check.
      const effectiveDuration =
        lesson.durationSeconds && lesson.durationSeconds > 0
          ? lesson.durationSeconds
          : providerDuration;
      if (effectiveDuration > 0 && currentSeconds / effectiveDuration >= AUTO_COMPLETE_THRESHOLD) {
        triggerAutoComplete();
      }

      // Throttled position save. Only fire when both enough wall-clock time
      // and enough video time have elapsed since the last save — skips the
      // churn of saving the same position repeatedly when paused.
      const now = Date.now();
      const posDelta = Math.abs(currentSeconds - lastSavedPosRef.current);
      if (
        currentSeconds > 0 &&
        now - lastSavedAtRef.current >= POSITION_SAVE_INTERVAL_MS &&
        posDelta >= POSITION_SAVE_MIN_DELTA_S
      ) {
        lastSavedAtRef.current = now;
        lastSavedPosRef.current = currentSeconds;
        void saveVideoPosition(lesson.id, currentSeconds);
      }
    },
    [lesson.durationSeconds, lesson.id, triggerAutoComplete],
  );

  // Final save when the tab is hidden (tab switch, minimize, nav away).
  // Best-effort: modern browsers keep in-flight fetches alive briefly.
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState !== 'hidden') return;
      const pos = currentPosRef.current;
      if (pos <= 0) return;
      if (Math.abs(pos - lastSavedPosRef.current) < 1) return;
      lastSavedPosRef.current = pos;
      void saveVideoPosition(lesson.id, pos);
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [lesson.id]);

  const handleVideoEnded = useCallback(() => {
    // Belt-and-suspenders: if the user scrubbed past the threshold quickly
    // enough to miss the progress tick, the end event still fires completion.
    triggerAutoComplete();
    if (!autoplayNextLesson) return;
    if (!nextLesson) return;
    if (cancelledRef.current) return;
    setCountdown(COUNTDOWN_SECONDS);
  }, [autoplayNextLesson, nextLesson, triggerAutoComplete]);

  // Tick the countdown and navigate when it hits 0
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      if (nextLesson) {
        router.push(`/courses/${course.slug}/${nextLesson.slug}`);
      }
      return;
    }
    const t = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown, nextLesson, course.slug, router]);

  function cancelCountdown() {
    cancelledRef.current = true;
    setCountdown(null);
  }

  function toggleSidebar() {
    setSidebarPreference(String(!sidebarCollapsed));
  }

  // Locate the current lesson's module for breadcrumb label.
  const currentModule = modules.find((m) =>
    m.lessons.some((l) => l.id === lesson.id),
  );
  const moduleIdx = currentModule
    ? modules.indexOf(currentModule) + 1
    : null;
  const lessonIdx = currentModule
    ? currentModule.lessons.findIndex((l) => l.id === lesson.id) + 1
    : null;

  return (
    <div className="bg-[var(--color-background)] text-[var(--color-foreground)] min-h-[calc(100vh-4rem)]">
      <div className="flex min-h-[calc(100vh-4rem)]">
        {/* ── Main column ───────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Top strip: back + breadcrumb + sidebar toggle (desktop) + mobile toggle */}
          <div className="flex items-center justify-between gap-3 px-4 md:px-6 lg:px-8 py-3 border-b border-[var(--color-border)]">
            <div className="flex items-center gap-3 min-w-0">
              <Link
                href={`/courses/${course.slug}`}
                aria-label={t('back', { course: course.title })}
                className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline truncate max-w-[240px]">
                  {course.title}
                </span>
              </Link>
              {moduleIdx && lessonIdx && (
                <span className="text-[10px] md:text-[11px] font-semibold uppercase tracking-[0.25em] text-[var(--color-muted-foreground)] hidden md:inline">
                  {t('breadcrumb', { module: String(moduleIdx).padStart(2, '0'), lesson: String(lessonIdx).padStart(2, '0') })}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <MobileLessonToggle
                modules={modules}
                currentLessonId={lesson.id}
                courseSlug={course.slug}
                thumbnailUrl={
                  course.thumbnailLandscapeUrl ??
                  course.heroBannerUrl ??
                  course.thumbnailPortraitUrl
                }
              />
              <button
                type="button"
                onClick={toggleSidebar}
                className="hidden md:inline-flex items-center justify-center w-9 h-9 rounded-lg text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)] transition"
                aria-label={sidebarCollapsed ? t('showEpisodes') : t('hideEpisodes')}
              >
                {sidebarCollapsed ? (
                  <PanelRightOpen className="w-4 h-4" />
                ) : (
                  <PanelRightClose className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Video / quiz / text / fallback */}
          <div className="relative bg-black">
            {lesson.contentType === 'quiz' ? (
              <div className="bg-[var(--color-background)] px-4 md:px-6 lg:px-8 py-8">
                {data.quiz ? (
                  <QuizRunner
                    quiz={data.quiz}
                    initialAttemptsUsed={data.quizAttemptsUsed}
                    initialAlreadyPassed={data.quizAlreadyPassed}
                  />
                ) : (
                  <div className="max-w-2xl mx-auto py-12 text-center text-sm text-[var(--color-muted-foreground)]">
                    {t('quizUnavailable')}
                  </div>
                )}
              </div>
            ) : lesson.contentType === 'video' &&
            (lesson.videoExternalId || lesson.youtubeVideoId) ? (
              <div className="max-w-[1600px] mx-auto">
                <VideoPlayer
                  key={lesson.id}
                  provider={lesson.videoProvider}
                  externalId={lesson.videoExternalId}
                  hash={lesson.videoHash}
                  youtubeVideoId={lesson.youtubeVideoId}
                  lessonId={lesson.id}
                  onEnded={handleVideoEnded}
                  onProgress={handleVideoProgress}
                  initialPositionSeconds={initialPositionSeconds}
                  autoPlay
                  title={lesson.title}
                  durationSeconds={lesson.durationSeconds}
                  resumePositionSeconds={canResume ? savedPosition : 0}
                  watermarkUrl={watermarkUrl}
                />
              </div>
            ) : lesson.textContent ? (
              <div className="max-w-3xl mx-auto px-4 md:px-6 py-12 text-[var(--color-foreground)] whitespace-pre-wrap leading-relaxed">
                {lesson.textContent}
              </div>
            ) : (
              <div className="max-w-3xl mx-auto px-4 md:px-6 py-16 text-center text-[var(--color-muted-foreground)]">
                {t('empty')}
              </div>
            )}

            {/* Autoplay countdown overlay */}
            {countdown !== null && nextLesson && (
              <AutoplayOverlay
                countdown={countdown}
                nextLesson={nextLesson}
                courseSlug={course.slug}
                onCancel={cancelCountdown}
              />
            )}
          </div>

          {/* Title + actions */}
          <section className="px-4 md:px-6 lg:px-8 py-6 md:py-8 border-b border-[var(--color-border)]">
            <div className="max-w-5xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="min-w-0">
                <h1 className="font-display text-2xl md:text-4xl font-medium text-[var(--color-foreground)] leading-[1.1] tracking-tight">
                  {lesson.title}
                </h1>
                {lesson.durationSeconds ? (
                  <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
                    {formatDuration(lesson.durationSeconds)}
                  </p>
                ) : null}
              </div>

              <div className="flex items-center gap-2 flex-wrap shrink-0">
                <MarkCompleteButton
                  lessonId={lesson.id}
                  isCompleted={isCompleted}
                />
                {prevLesson && (
                  <Link
                    href={`/courses/${course.slug}/${prevLesson.slug}`}
                    className="group flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm font-semibold text-[var(--color-foreground)] hover:bg-[var(--color-muted)] hover:border-[var(--color-foreground)]/20 active:scale-[0.97] transition"
                  >
                    <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
                    {t('previous')}
                  </Link>
                )}
                {nextLesson && (
                  <Link
                    href={`/courses/${course.slug}/${nextLesson.slug}`}
                    className="group flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-semibold shadow-sm hover:shadow-md hover:opacity-95 active:scale-[0.97] transition"
                    style={{ backgroundColor: 'var(--color-primary)' }}
                  >
                    {t('next')}
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                )}
              </div>
            </div>
          </section>

          {/* Tabs: About / Materials / Comments */}
          <LessonPlayerExtras
            lesson={lesson}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
          />
        </div>

        {/* ── Desktop sidebar ─────────────────────────── */}
        {hydrated && !sidebarCollapsed && (
          <aside className="hidden md:flex w-[320px] lg:w-[360px] shrink-0 border-l border-[var(--color-border)] bg-[var(--color-card)] flex-col overflow-hidden">
            <LessonSidebar
              modules={modules}
              currentLessonId={lesson.id}
              courseSlug={course.slug}
              thumbnailUrl={
                course.thumbnailLandscapeUrl ??
                course.heroBannerUrl ??
                course.thumbnailPortraitUrl
              }
            />
          </aside>
        )}
      </div>

      {/* Ask-the-Course floating chat drawer */}
      {chatEnabled && <CourseChatDrawer courseId={course.id} courseTitle={course.title} />}
    </div>
  );
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function AutoplayOverlay({
  countdown,
  nextLesson,
  courseSlug,
  onCancel,
}: {
  countdown: number;
  nextLesson: { slug: string; title: string };
  courseSlug: string;
  onCancel: () => void;
}) {
  const t = useTranslations('learning.lesson');
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="max-w-md text-center px-6 py-8 space-y-5">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/70">
          {t('upNext')}
        </p>
        <h3 className="text-xl md:text-2xl font-black text-white leading-tight">
          {nextLesson.title}
        </h3>
        <div
          className="mx-auto w-16 h-16 rounded-full border-2 flex items-center justify-center text-xl font-black text-white"
          style={{ borderColor: 'var(--color-primary)' }}
          aria-label={t('countdown', { seconds: countdown })}
        >
          {countdown}
        </div>
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-white/10 hover:bg-white/20 border border-white/20"
          >
            <X className="w-4 h-4" />
            {t('cancel')}
          </button>
          <Link
            href={`/courses/${courseSlug}/${nextLesson.slug}`}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-black bg-white hover:bg-white/90"
          >
            <Play className="w-4 h-4 fill-current" />
            {t('playNow')}
          </Link>
        </div>
      </div>
    </div>
  );
}
