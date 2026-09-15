-- Administrative grants have no purchase receipt. Keep enrollment and cohort edits atomic.
CREATE FUNCTION public.apply_manual_enrollment(
  p_user_id uuid, p_access_level_id uuid, p_source text, p_source_transaction_id text,
  p_expires_at timestamptz, p_cohort_mode text, p_cohorts jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_enrollment_id uuid;
  v_created boolean;
  v_cohorts jsonb := coalesce(p_cohorts, '[]'::jsonb);
  v_requested integer;
  v_valid integer;
  v_courses integer;
  v_assignments jsonb;
BEGIN
  IF p_source IS NULL OR btrim(p_source) = '' THEN RAISE EXCEPTION 'Missing enrollment source'; END IF;
  IF p_cohort_mode IS NULL OR p_cohort_mode NOT IN ('preserve', 'replace', 'merge') THEN
    RAISE EXCEPTION 'Invalid cohort edit mode';
  END IF;
  IF jsonb_typeof(v_cohorts) <> 'array' THEN RAISE EXCEPTION 'Cohorts must be an array'; END IF;
  v_requested := jsonb_array_length(v_cohorts);
  IF p_cohort_mode = 'preserve' AND v_requested <> 0 THEN
    RAISE EXCEPTION 'Preserving cohorts cannot include assignments';
  END IF;

  -- Both callers use this lock; the unique enrollment row also serializes with payment writes.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'manual:' || p_user_id::text || ':' || p_access_level_id::text, 0));

  SELECT count(*), count(DISTINCT c.course_id),
      coalesce(jsonb_agg(jsonb_build_object('course_id', c.course_id, 'cohort_id', c.id)), '[]'::jsonb)
    INTO v_valid, v_courses, v_assignments
    FROM jsonb_to_recordset(v_cohorts) AS a(course_id uuid, cohort_id uuid)
    JOIN public.cohorts c ON c.id = a.cohort_id AND (a.course_id IS NULL OR a.course_id = c.course_id)
    JOIN public.access_level_courses g ON g.course_id = c.course_id AND g.access_level_id = p_access_level_id;
  IF v_valid <> v_requested OR v_courses <> v_requested THEN
    RAISE EXCEPTION 'Each cohort must belong to a distinct course granted by this access level' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.enrollments(user_id, access_level_id, source, source_transaction_id, expires_at)
    VALUES(p_user_id, p_access_level_id, p_source, p_source_transaction_id, p_expires_at)
    ON CONFLICT(user_id, access_level_id) DO NOTHING
    RETURNING id INTO v_enrollment_id;
  v_created := FOUND;
  IF NOT v_created THEN
    UPDATE public.enrollments SET source = p_source, source_transaction_id = p_source_transaction_id,
      expires_at = p_expires_at, is_active = true, revoked_at = NULL, revocation_reason = NULL,
      external_product_id = NULL, updated_at = now()
      WHERE user_id = p_user_id AND access_level_id = p_access_level_id
      RETURNING id INTO v_enrollment_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Enrollment changed while granting access; retry'; END IF;
  END IF;

  IF p_cohort_mode = 'replace' THEN
    DELETE FROM public.enrollment_cohorts WHERE enrollment_id = v_enrollment_id;
  END IF;
  IF p_cohort_mode IN ('replace', 'merge') THEN
    INSERT INTO public.enrollment_cohorts(enrollment_id, course_id, cohort_id)
      SELECT v_enrollment_id, a.course_id, a.cohort_id
      FROM jsonb_to_recordset(v_assignments) AS a(course_id uuid, cohort_id uuid)
      WHERE true
      ON CONFLICT(enrollment_id, course_id) DO UPDATE SET cohort_id = EXCLUDED.cohort_id;
  END IF;

  RETURN jsonb_build_object('enrollment_id', v_enrollment_id, 'created', v_created);
END $$;

REVOKE ALL ON FUNCTION public.apply_manual_enrollment(uuid,uuid,text,text,timestamptz,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_manual_enrollment(uuid,uuid,text,text,timestamptz,text,jsonb) TO service_role;
