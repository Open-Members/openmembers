// Core domain types for Members Area

export type Locale = 'en' | 'es' | 'pt';

export type UserRole = 'user' | 'admin' | 'super_admin';
export type UserStatus = 'active' | 'suspended';

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  createdAt: string;
}

// --- Courses ---

export interface Course {
  id: string;
  title: string;
  slug: string;
  description?: string;
  thumbnailUrl?: string;
  isPublished: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Module {
  id: string;
  courseId: string;
  title: string;
  description?: string;
  sortOrder: number;
  isPublished: boolean;
}

export type VideoProvider = 'youtube' | 'vimeo' | 'r2';

export interface Lesson {
  id: string;
  moduleId: string;
  title: string;
  slug: string;
  contentType: 'video' | 'text' | 'quiz';
  description?: string;
  /** @deprecated use videoProvider + videoExternalId. Kept for backwards compat. */
  youtubeVideoId?: string;
  videoProvider?: VideoProvider;
  videoExternalId?: string;
  /** Private-link unlock hash (used by Vimeo private videos). */
  videoHash?: string;
  textContent?: string;
  durationSeconds?: number;
  sortOrder: number;
  isPublished: boolean;
  isFreePreview: boolean;
}

export interface LessonAttachment {
  id: string;
  lessonId: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSizeBytes?: number;
  sortOrder: number;
}

// --- Access & Enrollment ---

export interface AccessLevel {
  id: string;
  name: string;
  slug: string;
  description?: string;
}

export interface Enrollment {
  id: string;
  userId: string;
  accessLevelId: string;
  source: 'stripe' | 'hotmart' | 'guru' | 'manual';
  sourceTransactionId?: string;
  enrolledAt: string;
  expiresAt?: string;
  isActive: boolean;
}

// --- Progress ---

export interface LessonProgress {
  id: string;
  userId: string;
  lessonId: string;
  isCompleted: boolean;
  completedAt?: string;
  videoPositionSeconds: number;
}

// --- Comments ---

export interface LessonComment {
  id: string;
  lessonId: string;
  userId: string;
  userDisplayName: string | null;
  userAvatarUrl?: string;
  parentId?: string;
  content: string;
  isPinned: boolean;
  createdAt: string;
}

// --- Drip Content ---

export interface DripRule {
  id: string;
  courseId: string;
  moduleId?: string;
  lessonId?: string;
  ruleType: 'days_after_enrollment' | 'fixed_date';
  daysAfter?: number;
  fixedDate?: string;
}

// --- Webhook ---

export interface WebhookConfig {
  id: string;
  provider: 'stripe' | 'hotmart' | 'guru' | 'generic';
  name: string;
  secretKey?: string;
  accessLevelId: string;
  expirationDays?: number;
  isActive: boolean;
  config: Record<string, unknown>;
}

// --- Notifications ---

export type NotificationType =
  | 'enrollment'
  | 'drip_unlock'
  | 'comment_reply'
  | 'announcement'
  | 'new_course'
  | 'new_lesson'
  | 'certificate';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  /** Optional short headline rendered with font-display. Legacy rows have null here. */
  title: string | null;
  message: string;
  /** Application-owned descriptor. Missing/invalid values use the persisted snapshot. */
  messageKey?: string | null;
  messageParams?: Record<string, unknown> | null;
  /** Where the card navigates on click. Null → no nav, just mark as read. */
  actionUrl: string | null;
  isRead: boolean;
  createdAt: string;
}

// --- Branding ---

export interface TenantSettings {
  id: string;
  siteName: string;
  logoUrl?: string;
  faviconUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  customDomain?: string;
}
