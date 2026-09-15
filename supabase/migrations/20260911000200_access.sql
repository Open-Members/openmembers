-- New-install access baseline. No source database scripts or data are replayed.
-- Private SECURITY DEFINER helpers use qualified names and a fixed search path.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE FUNCTION private.is_active_user()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'active');
$$;

CREATE FUNCTION private.is_admin_user()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.status = 'active' AND p.role IN ('admin', 'super_admin')
  );
$$;

CREATE FUNCTION private.can_access_course(p_course_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT private.is_active_user() AND EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.id = p_course_id AND (
      private.is_admin_user() OR (
        c.is_published AND NOT c.is_coming_soon AND (
          c.is_free OR EXISTS (
            SELECT 1 FROM public.enrollments e
            JOIN public.access_level_courses a ON a.access_level_id = e.access_level_id
            WHERE a.course_id = c.id AND e.user_id = auth.uid() AND e.is_active
              AND (e.expires_at IS NULL OR e.expires_at > now())
          )
        )
      )
    )
  );
$$;

CREATE FUNCTION private.can_access_lesson(p_lesson_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_lesson record;
  v_enrolled_at timestamptz;
  v_rule record;
BEGIN
  IF NOT private.is_active_user() THEN RETURN false; END IF;
  SELECT l.id, l.module_id, l.is_published AS lesson_published, l.is_free_preview,
         m.course_id, m.is_published AS module_published,
         c.is_published AS course_published, c.is_free, c.is_coming_soon
    INTO v_lesson
    FROM public.lessons l JOIN public.modules m ON m.id = l.module_id
    JOIN public.courses c ON c.id = m.course_id WHERE l.id = p_lesson_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF private.is_admin_user() THEN RETURN true; END IF;
  IF NOT (v_lesson.lesson_published AND v_lesson.module_published AND v_lesson.course_published)
     OR v_lesson.is_coming_soon THEN RETURN false; END IF;
  IF v_lesson.is_free OR v_lesson.is_free_preview THEN RETURN true; END IF;

  SELECT min(e.enrolled_at) INTO v_enrolled_at
    FROM public.enrollments e
    JOIN public.access_level_courses a ON a.access_level_id = e.access_level_id
    WHERE a.course_id = v_lesson.course_id AND e.user_id = auth.uid() AND e.is_active
      AND (e.expires_at IS NULL OR e.expires_at > now());
  IF v_enrolled_at IS NULL THEN RETURN false; END IF;

  SELECT r.rule_type, r.days_after, r.fixed_date INTO v_rule
    FROM public.drip_rules r
    WHERE r.course_id = v_lesson.course_id AND (
      r.lesson_id = p_lesson_id OR
      (r.lesson_id IS NULL AND r.module_id = v_lesson.module_id) OR
      (r.lesson_id IS NULL AND r.module_id IS NULL)
    )
    ORDER BY CASE WHEN r.lesson_id IS NOT NULL THEN 0 WHEN r.module_id IS NOT NULL THEN 1 ELSE 2 END,
             r.created_at, r.id
    LIMIT 1;
  IF NOT FOUND THEN RETURN true; END IF;
  IF v_rule.rule_type = 'days_after_enrollment' THEN
    RETURN now() >= v_enrolled_at + make_interval(days => coalesce(v_rule.days_after, 0));
  ELSIF v_rule.rule_type = 'fixed_date' THEN
    RETURN v_rule.fixed_date IS NOT NULL AND now() >= v_rule.fixed_date;
  END IF;
  RETURN false;
END;
$$;

CREATE FUNCTION public.can_access_course(p_course_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.can_access_course(p_course_id); $$;
CREATE FUNCTION public.can_access_lesson(p_lesson_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.can_access_lesson(p_lesson_id); $$;

-- Identity is created from Auth, with safe fixed privilege defaults.
CREATE FUNCTION private.sync_auth_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.profiles (id, email, display_name, avatar_url, role, status, last_login_at)
    VALUES (
      NEW.id, NEW.email,
      coalesce(nullif(NEW.raw_user_meta_data ->> 'display_name', ''), nullif(NEW.raw_user_meta_data ->> 'full_name', ''), ''),
      coalesce(NEW.raw_user_meta_data ->> 'avatar_url', NEW.raw_user_meta_data ->> 'picture'),
      'user', 'active', NEW.last_sign_in_at
    );
  ELSE
    UPDATE public.profiles
      SET email = NEW.email, last_login_at = NEW.last_sign_in_at
      WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER openmembers_auth_profile_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.sync_auth_profile();
CREATE TRIGGER openmembers_auth_profile_updated AFTER UPDATE OF email, last_sign_in_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.sync_auth_profile();

-- SECURITY INVOKER is deliberate: current_user must remain the caller here,
-- not become the function owner. A SET ROLE authenticated test cannot bypass it.
CREATE FUNCTION private.protect_profile_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'service_role') THEN RETURN NEW; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.must_change_password IS DISTINCT FROM OLD.must_change_password
     OR NEW.last_login_at IS DISTINCT FROM OLD.last_login_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Protected profile fields require a privileged server operation' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_profile_identity BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.protect_profile_identity();

CREATE FUNCTION private.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT c.table_name FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.column_name = 'updated_at'
  LOOP
    EXECUTE format('CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at()', t.table_name);
  END LOOP;
END;
$$;

CREATE FUNCTION private.protect_comment_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'service_role') OR private.is_admin_user() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_pinned THEN RAISE EXCEPTION 'Only administrators may pin comments' USING ERRCODE = '42501'; END IF;
  ELSIF NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.lesson_id IS DISTINCT FROM OLD.lesson_id OR NEW.parent_id IS DISTINCT FROM OLD.parent_id
      OR NEW.is_pinned IS DISTINCT FROM OLD.is_pinned OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Only comment text may be edited by its author' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_comment_fields BEFORE INSERT OR UPDATE ON public.lesson_comments
  FOR EACH ROW EXECUTE FUNCTION private.protect_comment_fields();

CREATE FUNCTION public.get_user_id_by_email(p_email text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1; $$;

CREATE FUNCTION public.compute_user_streak(p_user_id uuid)
RETURNS TABLE(current_streak int, longest_streak int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH permitted AS (
    SELECT auth.role() = 'service_role' OR private.is_admin_user()
      OR (private.is_active_user() AND p_user_id = auth.uid()) AS allowed
  ), activity AS (
    SELECT DISTINCT (p.updated_at AT TIME ZONE 'UTC')::date AS d
    FROM public.lesson_progress p, permitted
    WHERE permitted.allowed AND p.user_id = p_user_id AND p.updated_at >= now() - interval '365 days'
  ), ordered AS (
    SELECT d, d - (row_number() OVER (ORDER BY d))::int AS grp FROM activity
  ), streaks AS (
    SELECT grp, count(*)::int AS len, max(d) AS last_day FROM ordered GROUP BY grp
  )
  SELECT coalesce((SELECT len FROM streaks WHERE last_day >= (now() AT TIME ZONE 'UTC')::date - 1 ORDER BY last_day DESC LIMIT 1), 0),
         coalesce((SELECT max(len) FROM streaks), 0);
$$;

CREATE FUNCTION public.admin_search_students(
  p_search text DEFAULT '', p_role text DEFAULT 'all', p_status text DEFAULT 'all',
  p_inactive text DEFAULT NULL, p_joined_days int DEFAULT NULL, p_source text DEFAULT 'all',
  p_access_level_id uuid DEFAULT NULL, p_page int DEFAULT 1, p_page_size int DEFAULT 50
)
RETURNS TABLE(id uuid, email text, display_name text, role text, status text,
  created_at timestamptz, last_sign_in_at timestamptz, signup_source text,
  enrollment_count bigint, total_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT p.id, coalesce(u.email, ''), p.display_name, p.role, p.status, p.created_at,
    u.last_sign_in_at, p.signup_source,
    (SELECT count(*) FROM public.enrollments e WHERE e.user_id = p.id AND e.is_active),
    count(*) OVER ()
  FROM public.profiles p JOIN auth.users u ON u.id = p.id
  WHERE (private.is_admin_user() OR auth.role() = 'service_role')
    AND (coalesce(p_search, '') = '' OR p.display_name ILIKE '%' || p_search || '%' OR u.email ILIKE '%' || p_search || '%')
    AND (p_role = 'all' OR p.role = p_role) AND (p_status = 'all' OR p.status = p_status)
    AND (p_inactive IS NULL OR (p_inactive = 'never' AND p.last_login_at IS NULL)
      OR (p_inactive = 'inactive_7' AND p.last_login_at < now() - interval '7 days')
      OR (p_inactive = 'inactive_30' AND p.last_login_at < now() - interval '30 days'))
    AND (p_joined_days IS NULL OR p.created_at >= now() - make_interval(days => p_joined_days))
    AND (p_source = 'all' OR p.signup_source = p_source)
    AND (p_access_level_id IS NULL OR EXISTS (
      SELECT 1 FROM public.enrollments e WHERE e.user_id = p.id AND e.access_level_id = p_access_level_id AND e.is_active
    ))
  ORDER BY p.created_at DESC, p.id
  LIMIT least(greatest(p_page_size, 1), 200)
  OFFSET (greatest(p_page, 1)::bigint - 1) * least(greatest(p_page_size, 1), 200);
$$;

-- All newly created public tables start closed. Each app privilege below is explicit.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t.tablename);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t.tablename);
  END LOOP;
END;
$$;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (display_name, avatar_url, autoplay_next_lesson) ON public.profiles TO authenticated;
CREATE POLICY profiles_read ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR private.is_admin_user());
CREATE POLICY profiles_update_self ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() AND private.is_active_user()) WITH CHECK (id = auth.uid() AND private.is_active_user());

-- Content administration does not include credentials, webhook payloads or email logs.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'courses','modules','lessons','lesson_attachments','instructors','access_levels','access_level_courses',
    'drip_rules','cohorts','enrollment_cohorts','collections','collection_courses','custom_menu_items',
    'live_classes','live_class_courses','quizzes','quiz_questions','quiz_options','scoring_rules','tenant_settings'
  ] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('CREATE POLICY admin_manage ON public.%I FOR ALL TO authenticated USING (private.is_admin_user()) WITH CHECK (private.is_admin_user())', t);
  END LOOP;
END;
$$;

GRANT SELECT ON public.courses TO anon;
CREATE POLICY course_catalog ON public.courses FOR SELECT TO anon, authenticated USING (is_published);
CREATE POLICY instructors_catalog ON public.instructors FOR SELECT TO authenticated USING (private.is_active_user());
CREATE POLICY access_levels_read ON public.access_levels FOR SELECT TO authenticated USING (private.is_active_user());
CREATE POLICY access_level_courses_read ON public.access_level_courses FOR SELECT TO authenticated USING (private.is_active_user());
CREATE POLICY modules_read ON public.modules FOR SELECT TO authenticated
  USING (is_published AND (
    private.can_access_course(course_id) OR EXISTS (
      SELECT 1 FROM public.lessons l
      WHERE l.module_id = modules.id AND l.is_free_preview AND private.can_access_lesson(l.id)
    )
  ));
CREATE POLICY lessons_read ON public.lessons FOR SELECT TO authenticated USING (private.can_access_lesson(id));
CREATE POLICY attachments_read ON public.lesson_attachments FOR SELECT TO authenticated USING (private.can_access_lesson(lesson_id));
CREATE POLICY drip_read ON public.drip_rules FOR SELECT TO authenticated USING (private.can_access_course(course_id));
CREATE POLICY cohorts_read ON public.cohorts FOR SELECT TO authenticated USING (private.can_access_course(course_id));
CREATE POLICY enrollment_cohorts_read ON public.enrollment_cohorts FOR SELECT TO authenticated
  USING (private.is_active_user() AND EXISTS (SELECT 1 FROM public.enrollments e WHERE e.id = enrollment_id AND e.user_id = auth.uid()));
CREATE POLICY collections_read ON public.collections FOR SELECT TO authenticated USING (is_enabled AND private.is_active_user());
CREATE POLICY collection_courses_read ON public.collection_courses FOR SELECT TO authenticated
  USING (private.is_active_user() AND EXISTS (SELECT 1 FROM public.collections c WHERE c.id = collection_id AND c.is_enabled));
CREATE POLICY menu_read ON public.custom_menu_items FOR SELECT TO authenticated USING (is_enabled AND private.is_active_user());
CREATE POLICY live_courses_read ON public.live_class_courses FOR SELECT TO authenticated USING (private.can_access_course(course_id));
CREATE POLICY live_classes_read ON public.live_classes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.live_class_courses c WHERE c.live_class_id = id AND private.can_access_course(c.course_id)));

GRANT SELECT ON public.enrollments, public.certificates, public.quiz_attempts, public.xp_events TO authenticated;
CREATE POLICY enrollments_read ON public.enrollments FOR SELECT TO authenticated
  USING (private.is_admin_user() OR (user_id = auth.uid() AND private.is_active_user()));
CREATE POLICY certificates_read ON public.certificates FOR SELECT TO authenticated
  USING (private.is_admin_user() OR (user_id = auth.uid() AND private.is_active_user()));
CREATE POLICY quiz_attempts_read ON public.quiz_attempts FOR SELECT TO authenticated
  USING (private.is_admin_user() OR (user_id = auth.uid() AND private.is_active_user()));
CREATE POLICY xp_events_read ON public.xp_events FOR SELECT TO authenticated
  USING (private.is_admin_user() OR (user_id = auth.uid() AND private.is_active_user()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_progress, public.lesson_comments, public.lesson_ratings TO authenticated;
CREATE POLICY progress_read ON public.lesson_progress FOR SELECT TO authenticated
  USING (private.is_admin_user() OR (user_id = auth.uid() AND private.is_active_user()));
CREATE POLICY progress_write ON public.lesson_progress FOR ALL TO authenticated
  USING (user_id = auth.uid() AND private.can_access_lesson(lesson_id) AND (
    private.is_admin_user() OR EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = lesson_id AND l.content_type <> 'quiz')
  ))
  WITH CHECK (user_id = auth.uid() AND private.can_access_lesson(lesson_id) AND (
    private.is_admin_user() OR EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = lesson_id AND l.content_type <> 'quiz')
  ));
CREATE POLICY comments_read ON public.lesson_comments FOR SELECT TO authenticated USING (private.can_access_lesson(lesson_id));
CREATE POLICY comments_insert ON public.lesson_comments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND private.can_access_lesson(lesson_id));
CREATE POLICY comments_update ON public.lesson_comments FOR UPDATE TO authenticated
  USING (private.is_admin_user() OR (user_id = auth.uid() AND private.can_access_lesson(lesson_id)))
  WITH CHECK (private.is_admin_user() OR (user_id = auth.uid() AND private.can_access_lesson(lesson_id)));
CREATE POLICY comments_delete ON public.lesson_comments FOR DELETE TO authenticated
  USING (private.is_admin_user() OR (user_id = auth.uid() AND private.can_access_lesson(lesson_id)));
CREATE POLICY ratings_read ON public.lesson_ratings FOR SELECT TO authenticated USING (private.can_access_lesson(lesson_id));
CREATE POLICY ratings_write ON public.lesson_ratings FOR ALL TO authenticated
  USING (user_id = auth.uid() AND private.can_access_lesson(lesson_id))
  WITH CHECK (user_id = auth.uid() AND private.can_access_lesson(lesson_id));

GRANT SELECT, DELETE ON public.notifications TO authenticated;
GRANT UPDATE (is_read) ON public.notifications TO authenticated;
CREATE POLICY notifications_own ON public.notifications FOR ALL TO authenticated
  USING (user_id = auth.uid() AND private.is_active_user()) WITH CHECK (user_id = auth.uid() AND private.is_active_user());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
CREATE POLICY push_own ON public.push_subscriptions FOR ALL TO authenticated
  USING (user_id = auth.uid() AND private.is_active_user()) WITH CHECK (user_id = auth.uid() AND private.is_active_user());

-- Column grants keep internal support notes out of authenticated REST responses.
GRANT SELECT (id, user_id, subject, message, status, created_at, updated_at) ON public.support_tickets TO authenticated;
GRANT INSERT (user_id, subject, message) ON public.support_tickets TO authenticated;
GRANT UPDATE (status, admin_note) ON public.support_tickets TO authenticated;
CREATE POLICY support_read ON public.support_tickets FOR SELECT TO authenticated
  USING (private.is_admin_user() OR (user_id = auth.uid() AND private.is_active_user()));
CREATE POLICY support_insert ON public.support_tickets FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND private.is_active_user() AND status = 'open' AND admin_note IS NULL);
CREATE POLICY support_admin_update ON public.support_tickets FOR UPDATE TO authenticated
  USING (private.is_admin_user()) WITH CHECK (private.is_admin_user());

GRANT SELECT ON public.live_class_clicks TO authenticated;
GRANT INSERT (live_class_id, user_id, source, user_agent) ON public.live_class_clicks TO authenticated;
CREATE POLICY live_clicks_read ON public.live_class_clicks FOR SELECT TO authenticated
  USING (private.is_admin_user() OR (user_id = auth.uid() AND private.is_active_user()));
CREATE POLICY live_clicks_insert ON public.live_class_clicks FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND private.is_active_user() AND EXISTS (
    SELECT 1 FROM public.live_class_courses c
    WHERE c.live_class_id = live_class_clicks.live_class_id AND private.can_access_course(c.course_id)
  ));

-- Chat writes/knowledge access pass through the guarded server, preventing
-- forged assistant messages or unscoped access to transcripts and embeddings.
GRANT SELECT ON public.chat_conversations, public.chat_messages TO authenticated;
GRANT INSERT (user_id, course_id) ON public.chat_conversations TO authenticated;
GRANT UPDATE (title, is_archived, last_message_at) ON public.chat_conversations TO authenticated;
GRANT DELETE ON public.chat_conversations TO authenticated;
GRANT INSERT (conversation_id, role, content) ON public.chat_messages TO authenticated;
CREATE POLICY conversations_read ON public.chat_conversations FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND private.can_access_course(course_id));
CREATE POLICY conversations_write ON public.chat_conversations FOR ALL TO authenticated
  USING (user_id = auth.uid() AND private.can_access_course(course_id))
  WITH CHECK (user_id = auth.uid() AND private.can_access_course(course_id));
CREATE POLICY messages_read ON public.chat_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.chat_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()));
CREATE POLICY messages_insert ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (role = 'user' AND EXISTS (
    SELECT 1 FROM public.chat_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()
  ));

-- Revoke the implicit PUBLIC execute permission of every elevated helper/RPC.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.is_active_user(), private.is_admin_user(),
  private.can_access_course(uuid), private.can_access_lesson(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_access_course(uuid), public.can_access_lesson(uuid),
  public.get_user_id_by_email(text), public.compute_user_streak(uuid),
  public.admin_search_students(text,text,text,text,int,text,uuid,int,int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_course(uuid), public.can_access_lesson(uuid),
  public.compute_user_streak(uuid), public.admin_search_students(text,text,text,text,int,text,uuid,int,int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(text) TO service_role;
