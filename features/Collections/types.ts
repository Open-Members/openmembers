import type { CardCourse } from '@/shared/components/student/CourseCard';

export type RowType =
  | 'manual'
  | 'continue_watching'
  | 'enrolled'
  | 'featured'
  | 'new'
  | 'free';

/** Admin-shape row: raw table data with course count for the editor. */
export type AdminCollectionRow = {
  id: string;
  rowType: RowType;
  title: string;
  subtitle: string | null;
  sortOrder: number;
  isEnabled: boolean;
  isSystem: boolean;
  courseCount: number;
};

/** A continue-watching entry — shaped for ContinueWatchingCard. */
export type ContinueItem = {
  courseSlug: string;
  lessonSlug: string;
  courseTitle: string;
  lessonTitle: string;
  thumbnailUrl: string | null;
  progressPercent: number;
};

/**
 * Resolved row for the student dashboard. Each row is either a list of
 * course cards (most types) or a list of continue-watching items. The
 * consumer decides which component to render.
 */
export type ResolvedCollection =
  | {
      kind: 'cards';
      id: string;
      rowType: RowType;
      title: string;
      subtitle: string | null;
      cards: CardCourse[];
    }
  | {
      kind: 'continue';
      id: string;
      rowType: 'continue_watching';
      title: string;
      subtitle: string | null;
      items: ContinueItem[];
    };
