'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Menu, X } from 'lucide-react';
import { LessonSidebar } from './LessonSidebar';
import type { ModuleWithLessonsAndProgress } from '../types';

interface MobileLessonToggleProps {
  modules: ModuleWithLessonsAndProgress[];
  currentLessonId: string;
  courseSlug: string;
  thumbnailUrl: string | null;
}

export function MobileLessonToggle({ modules, currentLessonId, courseSlug, thumbnailUrl }: MobileLessonToggleProps) {
  const [isOpen, setIsOpen] = useState(false);
  const t = useTranslations('learning.sidebar');

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--color-muted)] text-sm font-semibold text-[var(--color-foreground)] md:hidden"
      >
        <Menu className="w-4 h-4" />
        {t('content')}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setIsOpen(false)}
          />
          {/* Sidebar panel */}
          <div className="absolute top-0 left-0 bottom-0 w-[300px] max-w-[85vw] bg-[var(--color-card)] shadow-xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
              <span className="font-bold text-sm text-[var(--color-foreground)]">{t('content')}</span>
              <button type="button" aria-label={t('close')} onClick={() => setIsOpen(false)}>
                <X className="w-5 h-5 text-[var(--color-muted-foreground)]" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto" onClick={() => setIsOpen(false)}>
              <LessonSidebar
                modules={modules}
                currentLessonId={currentLessonId}
                courseSlug={courseSlug}
                thumbnailUrl={thumbnailUrl}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
