-- Open Members: consolidated schema for a new, independent installation.
-- No customer data, credentials, operational scripts, or source history.
-- Access policies, Auth synchronization, and Storage follow in migration 002.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
-- The current direct PostgreSQL retrieval client uses ::vector and <=> without
-- schema qualification. Keep the vector type/operator in its public search path.
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  display_name text NOT NULL DEFAULT '',
  avatar_url text,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'super_admin')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  country text,
  phone text,
  signup_source text,
  signup_campaign text,
  must_change_password boolean NOT NULL DEFAULT false,
  autoplay_next_lesson boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX profiles_role_status_idx ON public.profiles (role, status);
CREATE INDEX profiles_created_at_idx ON public.profiles (created_at DESC);
CREATE INDEX profiles_last_login_idx ON public.profiles (last_login_at);
CREATE INDEX profiles_email_idx ON public.profiles (lower(email));

CREATE TABLE public.tenant_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_name text NOT NULL DEFAULT 'Open Members',
  logo_url text,
  logo_light_url text,
  logo_dark_url text,
  favicon_url text,
  og_image_url text,
  primary_color text NOT NULL DEFAULT '#0235A8',
  accent_color text NOT NULL DEFAULT '#F20505',
  secondary_color text,
  font_family text NOT NULL DEFAULT 'Plus Jakarta Sans',
  custom_domain text,
  home_hero_banner_url text,
  home_hero_trailer_youtube_id text,
  home_hero_title text,
  home_hero_subtitle text,
  home_hero_overlay_opacity smallint NOT NULL DEFAULT 70
    CHECK (home_hero_overlay_opacity BETWEEN 0 AND 100),
  home_hero_show_text boolean NOT NULL DEFAULT true,
  loading_bar_style text NOT NULL DEFAULT 'gradient'
    CHECK (loading_bar_style IN ('solid', 'gradient')),
  loading_bar_colors jsonb NOT NULL DEFAULT '["#3AD48A", "#F2A85E", "#F20505", "#0235A8"]'::jsonb
    CHECK (jsonb_typeof(loading_bar_colors) = 'array'
      AND jsonb_array_length(loading_bar_colors) BETWEEN 2 AND 6),
  email_from_address text,
  email_from_name text,
  email_reply_to text,
  support_inbox_email text,
  certificate_enabled boolean NOT NULL DEFAULT false,
  certificate_title text,
  certificate_body text,
  certificate_signature_url text,
  certificate_signature_name text,
  certificate_signature_role text,
  certificate_footer text,
  certificate_accent_color text,
  certificate_logo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- One configuration row per installation, regardless of the generated UUID.
CREATE UNIQUE INDEX tenant_settings_singleton_idx ON public.tenant_settings ((true));

CREATE TABLE public.instructors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  headline text,
  portrait_url text,
  bio text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  short_description text,
  thumbnail_url text,
  thumbnail_landscape_url text,
  thumbnail_portrait_url text,
  hero_banner_url text,
  hero_overlay_opacity smallint NOT NULL DEFAULT 70 CHECK (hero_overlay_opacity BETWEEN 0 AND 100),
  hero_show_text boolean NOT NULL DEFAULT true,
  trailer_youtube_id text,
  trailer_r2_key text,
  duration_minutes integer CHECK (duration_minutes >= 0),
  instructor_id uuid REFERENCES public.instructors(id) ON DELETE SET NULL,
  checkout_url text,
  content_format text NOT NULL DEFAULT 'video' CHECK (content_format IN ('video', 'ebook')),
  is_published boolean NOT NULL DEFAULT false,
  is_free boolean NOT NULL DEFAULT false,
  is_featured boolean NOT NULL DEFAULT false,
  is_new boolean NOT NULL DEFAULT false,
  is_coming_soon boolean NOT NULL DEFAULT false,
  certificate_enabled boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX courses_published_order_idx ON public.courses (is_published, sort_order);
CREATE INDEX courses_instructor_idx ON public.courses (instructor_id);

CREATE TABLE public.modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX modules_course_order_idx ON public.modules (course_id, sort_order);

CREATE TABLE public.lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  title text NOT NULL,
  slug text NOT NULL,
  content_type text NOT NULL DEFAULT 'video' CHECK (content_type IN ('video', 'text', 'quiz')),
  description text,
  youtube_video_id text,
  video_provider text CHECK (video_provider IN ('youtube', 'vimeo', 'r2')),
  video_external_id text,
  video_hash text,
  text_content text,
  ebook_cover_url text,
  duration_seconds integer CHECK (duration_seconds >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT false,
  is_free_preview boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (module_id, slug)
);
CREATE INDEX lessons_module_order_idx ON public.lessons (module_id, sort_order);

CREATE TABLE public.lesson_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  file_size_bytes bigint CHECK (file_size_bytes >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lesson_attachments_lesson_order_idx ON public.lesson_attachments (lesson_id, sort_order);

CREATE TABLE public.access_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.access_level_courses (
  access_level_id uuid NOT NULL REFERENCES public.access_levels(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  PRIMARY KEY (access_level_id, course_id)
);
CREATE INDEX access_level_courses_course_idx ON public.access_level_courses (course_id, access_level_id);

CREATE TABLE public.enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  access_level_id uuid NOT NULL REFERENCES public.access_levels(id) ON DELETE RESTRICT,
  -- Provider values and administrative import origins are intentionally open.
  source text NOT NULL DEFAULT 'manual',
  source_transaction_id text,
  external_product_id text,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  first_accessed_at timestamptz,
  completed_at timestamptz,
  revoked_at timestamptz,
  revocation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, access_level_id)
);
CREATE INDEX enrollments_access_level_idx ON public.enrollments (access_level_id, is_active);
CREATE INDEX enrollments_active_expiry_idx ON public.enrollments (is_active, expires_at);
CREATE INDEX enrollments_source_transaction_idx ON public.enrollments (source, source_transaction_id);
CREATE INDEX enrollments_enrolled_at_idx ON public.enrollments (enrolled_at DESC);

CREATE TABLE public.cohorts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  start_date date,
  end_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, slug),
  UNIQUE (id, course_id),
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);
CREATE TABLE public.enrollment_cohorts (
  enrollment_id uuid NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  cohort_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (enrollment_id, course_id),
  CONSTRAINT enrollment_cohorts_cohort_id_fkey FOREIGN KEY (cohort_id, course_id)
    REFERENCES public.cohorts(id, course_id) ON DELETE CASCADE
);
CREATE INDEX enrollment_cohorts_cohort_idx ON public.enrollment_cohorts (cohort_id);

CREATE TABLE public.drip_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  module_id uuid REFERENCES public.modules(id) ON DELETE CASCADE,
  lesson_id uuid REFERENCES public.lessons(id) ON DELETE CASCADE,
  rule_type text NOT NULL CHECK (rule_type IN ('days_after_enrollment', 'fixed_date')),
  days_after integer CHECK (days_after >= 0),
  fixed_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((rule_type = 'days_after_enrollment' AND days_after IS NOT NULL)
    OR (rule_type = 'fixed_date' AND fixed_date IS NOT NULL))
);
CREATE INDEX drip_rules_course_idx ON public.drip_rules (course_id);
CREATE INDEX drip_rules_module_idx ON public.drip_rules (module_id);
CREATE INDEX drip_rules_lesson_idx ON public.drip_rules (lesson_id);

CREATE TABLE public.collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  row_type text NOT NULL CHECK (row_type IN ('manual', 'continue_watching', 'enrolled', 'featured', 'new', 'free')),
  title text NOT NULL,
  subtitle text,
  sort_order integer NOT NULL DEFAULT 0,
  is_enabled boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX collections_enabled_order_idx ON public.collections (is_enabled, sort_order);
CREATE TABLE public.collection_courses (
  collection_id uuid NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (collection_id, course_id)
);
CREATE INDEX collection_courses_order_idx ON public.collection_courses (collection_id, sort_order);
CREATE INDEX collection_courses_course_idx ON public.collection_courses (course_id);

CREATE TABLE public.custom_menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  url text NOT NULL,
  icon_name text,
  sort_order integer NOT NULL DEFAULT 0,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX custom_menu_items_enabled_order_idx ON public.custom_menu_items (is_enabled, sort_order);

CREATE TABLE public.lesson_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  is_completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  video_position_seconds integer NOT NULL DEFAULT 0 CHECK (video_position_seconds >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, lesson_id)
);
CREATE INDEX lesson_progress_lesson_idx ON public.lesson_progress (lesson_id);
CREATE INDEX lesson_progress_user_activity_idx ON public.lesson_progress (user_id, updated_at DESC);
CREATE INDEX lesson_progress_completed_idx ON public.lesson_progress (completed_at) WHERE is_completed;

CREATE TABLE public.lesson_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  parent_id uuid,
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, lesson_id),
  CONSTRAINT lesson_comments_parent_id_fkey FOREIGN KEY (parent_id, lesson_id)
    REFERENCES public.lesson_comments(id, lesson_id) ON DELETE CASCADE,
  CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE INDEX lesson_comments_lesson_created_idx ON public.lesson_comments (lesson_id, created_at);
CREATE INDEX lesson_comments_user_idx ON public.lesson_comments (user_id);
CREATE INDEX lesson_comments_parent_idx ON public.lesson_comments (parent_id);

CREATE TABLE public.lesson_ratings (
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stars smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lesson_id, user_id)
);
CREATE INDEX lesson_ratings_user_idx ON public.lesson_ratings (user_id);
CREATE INDEX lesson_ratings_created_at_idx ON public.lesson_ratings (created_at);

CREATE TABLE public.certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  certificate_url text,
  verification_code text NOT NULL UNIQUE,
  issued_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, course_id)
);
CREATE INDEX certificates_course_idx ON public.certificates (course_id);
CREATE INDEX certificates_issued_at_idx ON public.certificates (issued_at DESC);

CREATE TABLE public.quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL UNIQUE REFERENCES public.lessons(id) ON DELETE CASCADE,
  intro text,
  pass_threshold_percent integer NOT NULL DEFAULT 70 CHECK (pass_threshold_percent BETWEEN 1 AND 100),
  max_attempts integer CHECK (max_attempts > 0),
  show_correct_answers boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'single_choice' CHECK (type IN ('single_choice', 'true_false')),
  prompt text NOT NULL,
  explanation text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quiz_questions_quiz_order_idx ON public.quiz_questions (quiz_id, sort_order);
CREATE TABLE public.quiz_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
  text text NOT NULL,
  is_correct boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0
);
CREATE INDEX quiz_options_question_order_idx ON public.quiz_options (question_id, sort_order);
CREATE TABLE public.quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  score_percent integer NOT NULL CHECK (score_percent BETWEEN 0 AND 100),
  passed boolean NOT NULL,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(answers) = 'object'),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quiz_attempts_user_quiz_idx ON public.quiz_attempts (user_id, quiz_id, created_at DESC);
CREATE INDEX quiz_attempts_quiz_idx ON public.quiz_attempts (quiz_id);
CREATE INDEX quiz_attempts_created_at_idx ON public.quiz_attempts (created_at);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('enrollment', 'drip_unlock', 'comment_reply', 'announcement', 'new_course', 'new_lesson', 'certificate')),
  title text,
  message text NOT NULL,
  action_url text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_created_idx ON public.notifications (user_id, created_at DESC);
CREATE INDEX notifications_user_unread_idx ON public.notifications (user_id) WHERE NOT is_read;
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  keys_p256dh text NOT NULL,
  keys_auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);
CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subject text NOT NULL CHECK (char_length(subject) BETWEEN 3 AND 200),
  message text NOT NULL CHECK (char_length(message) BETWEEN 5 AND 10000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'closed')),
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_tickets_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES public.profiles(id) ON DELETE CASCADE
);
CREATE INDEX support_tickets_user_created_idx ON public.support_tickets (user_id, created_at DESC);
CREATE INDEX support_tickets_status_created_idx ON public.support_tickets (status, created_at DESC);

CREATE TABLE public.scoring_rules (
  trigger text PRIMARY KEY CHECK (trigger IN ('lesson_completed', 'rating_given', 'enrollment_new', 'chat_message')),
  points integer NOT NULL CHECK (points BETWEEN 0 AND 10000),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Compatibility for the retained practice-calendar reader. No legacy exercise
-- domain or historical XP records are introduced by this baseline.
CREATE TABLE public.xp_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX xp_events_user_reason_created_idx ON public.xp_events (user_id, reason, created_at);

CREATE TABLE public.live_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  starts_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 60 CHECK (duration_minutes BETWEEN 5 AND 600),
  meeting_url text NOT NULL,
  origin_timezone text NOT NULL DEFAULT 'UTC',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX live_classes_starts_at_idx ON public.live_classes (starts_at);
CREATE TABLE public.live_class_courses (
  live_class_id uuid NOT NULL REFERENCES public.live_classes(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  PRIMARY KEY (live_class_id, course_id)
);
CREATE INDEX live_class_courses_course_idx ON public.live_class_courses (course_id, live_class_id);
CREATE TABLE public.live_class_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  live_class_id uuid NOT NULL REFERENCES public.live_classes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  clicked_at timestamptz NOT NULL DEFAULT now(),
  clicked_hour timestamp GENERATED ALWAYS AS (date_trunc('hour', clicked_at AT TIME ZONE 'UTC')) STORED,
  source text NOT NULL DEFAULT 'banner' CHECK (source IN ('banner', 'calendar', 'admin')),
  user_agent text,
  CONSTRAINT live_class_clicks_dedupe_hour UNIQUE (live_class_id, user_id, source, clicked_hour)
);
CREATE INDEX live_class_clicks_user_idx ON public.live_class_clicks (user_id, clicked_at DESC);
CREATE INDEX live_class_clicks_clicked_at_idx ON public.live_class_clicks (clicked_at);

CREATE TABLE public.webhook_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('stripe', 'hotmart', 'guru', 'generic')),
  name text NOT NULL,
  secret_key text NOT NULL,
  previous_secret_key text,
  previous_secret_expires_at timestamptz,
  expected_producer_id text,
  access_level_id uuid REFERENCES public.access_levels(id) ON DELETE SET NULL,
  expiration_days integer CHECK (expiration_days > 0),
  is_active boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX webhook_configs_provider_active_idx ON public.webhook_configs (provider, is_active);
CREATE INDEX webhook_configs_access_level_idx ON public.webhook_configs (access_level_id);
CREATE TABLE public.webhook_product_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_config_id uuid NOT NULL REFERENCES public.webhook_configs(id) ON DELETE CASCADE,
  external_product_id text NOT NULL,
  access_level_id uuid NOT NULL REFERENCES public.access_levels(id) ON DELETE RESTRICT,
  expiration_days integer CHECK (expiration_days > 0),
  sales_mode text NOT NULL DEFAULT 'one_time' CHECK (sales_mode IN ('one_time', 'subscription')),
  title text,
  tags text[] NOT NULL DEFAULT '{}',
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (webhook_config_id, external_product_id)
);
CREATE INDEX webhook_product_mappings_access_level_idx ON public.webhook_product_mappings (access_level_id);
CREATE TABLE public.webhook_product_mapping_cohorts (
  mapping_id uuid NOT NULL REFERENCES public.webhook_product_mappings(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  cohort_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mapping_id, course_id),
  CONSTRAINT webhook_product_mapping_cohorts_cohort_id_fkey FOREIGN KEY (cohort_id, course_id)
    REFERENCES public.cohorts(id, course_id) ON DELETE CASCADE
);
CREATE INDEX webhook_mapping_cohorts_cohort_idx ON public.webhook_product_mapping_cohorts (cohort_id);
CREATE TABLE public.webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_config_id uuid REFERENCES public.webhook_configs(id) ON DELETE SET NULL,
  provider text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processed', 'failed')),
  error_message text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX webhook_logs_config_idx ON public.webhook_logs (webhook_config_id);
CREATE INDEX webhook_logs_created_at_idx ON public.webhook_logs (created_at DESC);
CREATE TABLE public.webhook_dead_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_config_id uuid REFERENCES public.webhook_configs(id) ON DELETE SET NULL,
  provider text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  last_error text,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'abandoned')),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX webhook_dead_letters_pending_idx ON public.webhook_dead_letters (next_attempt_at) WHERE status = 'pending';
CREATE INDEX webhook_dead_letters_config_idx ON public.webhook_dead_letters (webhook_config_id);
CREATE TABLE public.webhook_rate_limit_hits (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  webhook_config_id uuid NOT NULL REFERENCES public.webhook_configs(id) ON DELETE CASCADE,
  hit_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX webhook_rate_limit_config_time_idx ON public.webhook_rate_limit_hits (webhook_config_id, hit_at DESC);
CREATE INDEX webhook_rate_limit_hit_at_idx ON public.webhook_rate_limit_hits (hit_at);
CREATE TABLE public.processed_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  external_event_id text NOT NULL,
  event_type text,
  processed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, external_event_id)
);
CREATE INDEX processed_webhook_events_processed_at_idx ON public.processed_webhook_events (processed_at);

CREATE TABLE public.email_templates (
  template_key text PRIMARY KEY,
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.email_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  template_key text NOT NULL,
  campaign_key text,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  provider_message_id text,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_sends_user_campaign_idx ON public.email_sends (user_id, campaign_key, sent_at DESC);
CREATE INDEX email_sends_template_idx ON public.email_sends (template_key, status);
CREATE TABLE public.email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'resend',
  event_type text NOT NULL,
  email text NOT NULL,
  subject text,
  reason text,
  message_id text,
  tag text,
  raw jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_events_occurred_at_idx ON public.email_events (occurred_at DESC);
CREATE INDEX email_events_type_time_idx ON public.email_events (event_type, occurred_at DESC);
CREATE INDEX email_events_message_idx ON public.email_events (provider, message_id);

CREATE TABLE public.chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title text,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_conversations_user_course_recent_idx ON public.chat_conversations (user_id, course_id, last_message_at DESC);
CREATE INDEX chat_conversations_course_idx ON public.chat_conversations (course_id);
CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  citations jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(citations) = 'array'),
  tokens jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_messages_conversation_created_idx ON public.chat_messages (conversation_id, created_at);
CREATE INDEX chat_messages_created_at_idx ON public.chat_messages (created_at);
CREATE TABLE public.chat_rate_limits (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL,
  message_count integer NOT NULL DEFAULT 1 CHECK (message_count >= 0),
  PRIMARY KEY (user_id, window_start)
);
CREATE INDEX chat_rate_limits_window_idx ON public.chat_rate_limits (window_start);
CREATE TABLE public.lesson_chunks (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL CHECK (chunk_index >= 0),
  text text NOT NULL,
  start_seconds integer CHECK (start_seconds >= 0),
  end_seconds integer CHECK (end_seconds >= 0),
  token_count integer CHECK (token_count >= 0),
  embedding public.vector(1536),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, chunk_index),
  CHECK (end_seconds IS NULL OR start_seconds IS NULL OR end_seconds >= start_seconds)
);
CREATE INDEX lesson_chunks_embedding_hnsw_idx ON public.lesson_chunks USING hnsw (embedding public.vector_cosine_ops);
