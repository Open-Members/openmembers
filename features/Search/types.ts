export type SearchCourseHit = {
  kind: 'course';
  id: string;
  title: string;
  slug: string;
  subtitle: string | null;
  thumbnailUrl: string | null;
  href: string;
  /** User currently has access — affects badge styling only; we never hide
   *  courses from search since the catalog is public. */
  locked: boolean;
};

export type SearchLessonHit = {
  kind: 'lesson';
  id: string;
  title: string;
  slug: string;
  description: string | null;
  courseTitle: string;
  courseSlug: string;
  /** Only accessible lessons are returned. The player rechecks authorization. */
  locked: boolean;
  href: string;
};

export type SearchResult = {
  /** Data may be partial when one query fails; never disguise it as empty. */
  error?: 'searchFailed';
  query: string;
  courses: SearchCourseHit[];
  lessons: SearchLessonHit[];
};
