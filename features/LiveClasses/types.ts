export interface LiveClass {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  durationMinutes: number;
  meetingUrl: string;
  /** IANA timezone the admin used when scheduling. Canonical display anchor. */
  originTimezone: string;
  createdAt: string;
  updatedAt: string;
}

export interface LiveClassCourseLink {
  id: string;
  title: string;
  slug: string;
}

export interface LiveClassWithCourses extends LiveClass {
  /** Every course this session is scoped to. Always ≥ 1. */
  courses: LiveClassCourseLink[];
}

/**
 * Transitional compatibility shape — carries the first course's metadata
 * in flat fields so callers that haven't migrated to `courses[]` keep
 * working during the multi-course rollout. New code should read
 * `courses` directly.
 */
export interface LiveClassWithCourse extends LiveClassWithCourses {
  /** @deprecated use courses[0].id */
  courseId: string;
  /** @deprecated use courses[0].title */
  courseTitle: string;
  /** @deprecated use courses[0].slug */
  courseSlug: string;
}

export interface UpcomingLiveClass extends LiveClassWithCourse {
  /** Milliseconds until `starts_at`. Negative means the class is already live. */
  msUntilStart: number;
  /** True when now is between starts_at and starts_at + durationMinutes. */
  isLive: boolean;
}
