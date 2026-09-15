'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { appToast } from '@/shared/lib/toast';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { EpisodeListItem } from '@/shared/components/student/EpisodeListItem';
import { setLessonCompleted } from '@/features/Progress/actions';
import type { ModuleWithLessonsAndProgress } from '../types';

interface LessonSidebarProps {
  modules: ModuleWithLessonsAndProgress[];
  currentLessonId: string;
  courseSlug: string;
  thumbnailUrl: string | null;
}

export function LessonSidebar({
  modules,
  currentLessonId,
  courseSlug,
  thumbnailUrl,
}: LessonSidebarProps) {
  const router = useRouter();
  const t = useTranslations('learning.sidebar');
  const errors = useTranslations('learning.errors');
  // Expand the current module by default; keep others collapsed until tapped.
  const currentModuleId = modules.find((m) =>
    m.lessons.some((l) => l.id === currentLessonId),
  )?.id;

  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(currentModuleId ? [currentModuleId] : []),
  );

  function toggle(moduleId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  }

  return (
    <nav aria-label={t('content')} className="flex flex-col h-full overflow-hidden">
      <div className="px-5 py-5 border-b border-hairline shrink-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[var(--color-muted-foreground)]">
          {t('episodes')}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {modules.map((mod, mIdx) => {
          const isOpen = expanded.has(mod.id);
          const completed = mod.lessons.filter((l) => l.progress?.isCompleted).length;
          const total = mod.lessons.length;

          return (
            <div
              key={mod.id}
              className="border-b border-hairline last:border-0"
            >
              <button
                type="button"
                onClick={() => toggle(mod.id)}
                aria-expanded={isOpen}
                className="flex items-center gap-3 w-full px-5 py-4 text-left hover:bg-[var(--color-muted)]/40 transition"
              >
                {isOpen ? (
                  <ChevronDown className="w-4 h-4 shrink-0 text-[var(--color-muted-foreground)]" />
                ) : (
                  <ChevronRight className="w-4 h-4 shrink-0 text-[var(--color-muted-foreground)]" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--color-muted-foreground)]">
                    {t('module', { number: String(mIdx + 1).padStart(2, '0') })}
                  </p>
                  <p className="font-display text-base font-medium text-[var(--color-foreground)] truncate mt-0.5 leading-tight">
                    {mod.title}
                  </p>
                </div>
                <span className="text-[11px] font-semibold text-[var(--color-muted-foreground)] shrink-0 tabular-nums">
                  {completed}/{total}
                </span>
              </button>

              {isOpen && (
                <div className="pb-3 px-2 space-y-0.5">
                  {mod.lessons.map((lesson, lIdx) => (
                    <EpisodeListItem
                      key={lesson.id}
                      index={lIdx + 1}
                      title={lesson.title}
                      durationSeconds={lesson.durationSeconds ?? null}
                      thumbnailUrl={thumbnailUrl}
                      href={`/courses/${courseSlug}/${lesson.slug}`}
                      isCompleted={lesson.progress?.isCompleted ?? false}
                      isCurrent={lesson.id === currentLessonId}
                      isFreePreview={lesson.isFreePreview}
                      onToggleComplete={async (next) => {
                        try {
                          const result = await setLessonCompleted(lesson.id, next);
                          if ('error' in result) {
                            appToast.danger(errors('saveProgress'));
                            return;
                          }
                          router.refresh();
                        } catch {
                          appToast.danger(errors('saveProgress'));
                        }
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
