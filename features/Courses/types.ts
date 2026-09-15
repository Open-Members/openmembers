import type { Course, Module, Lesson, LessonAttachment, LessonProgress } from '@/shared/types/interfaces';

export interface ModuleWithLessons extends Module {
  lessons: Lesson[];
}

export interface CourseWithModules extends Course {
  modules: ModuleWithLessons[];
}

export interface CourseWithProgress extends Course {
  totalLessons: number;
  completedLessons: number;
  progressPercent: number;
  /** Slug of the lesson to jump into: most recent non-completed, or first lesson, or null if the course has none. */
  resumeLessonSlug: string | null;
}

export interface LessonWithAttachments extends Lesson {
  attachments: LessonAttachment[];
}

export interface LessonWithProgress extends Lesson {
  progress?: LessonProgress;
  attachments: LessonAttachment[];
}

export interface ModuleWithLessonsAndProgress extends Module {
  lessons: LessonWithProgress[];
}

export interface CourseDetail extends Course {
  modules: ModuleWithLessonsAndProgress[];
  totalLessons: number;
  completedLessons: number;
  progressPercent: number;
}
