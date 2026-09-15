-- Serialize the attempt limit and persist a passing attempt with lesson progress
-- in one transaction. Grading and lesson authorization remain server-side.
CREATE FUNCTION public.submit_quiz_attempt(
  p_user_id uuid,
  p_quiz_id uuid,
  p_score_percent integer,
  p_passed boolean,
  p_answers jsonb,
  p_completed_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lesson_id uuid;
  v_pass_threshold integer;
  v_max_attempts integer;
  v_prior_attempts bigint;
  v_attempt_id uuid;
  v_progress_completed boolean := false;
  v_completed_at timestamptz := coalesce(p_completed_at, now());
BEGIN
  IF p_user_id IS NULL OR p_quiz_id IS NULL
     OR p_score_percent IS NULL OR p_score_percent NOT BETWEEN 0 AND 100
     OR p_passed IS NULL
     OR p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN
    RETURN jsonb_build_object(
      'status', 'invalid_submission',
      'attempt_id', NULL,
      'attempts_used', 0,
      'max_attempts', NULL,
      'progress_completed', false
    );
  END IF;

  -- A transaction-scoped lock closes the count/insert race even when there is
  -- no existing attempt row to lock. The quiz row lock stabilizes its current
  -- threshold, lesson and attempt limit until this transaction commits.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'quiz-attempt:' || p_user_id::text || ':' || p_quiz_id::text,
      0
    )
  );

  SELECT q.lesson_id, q.pass_threshold_percent, q.max_attempts
    INTO v_lesson_id, v_pass_threshold, v_max_attempts
    FROM public.quizzes q
    WHERE q.id = p_quiz_id
    FOR SHARE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'quiz_unavailable',
      'attempt_id', NULL,
      'attempts_used', 0,
      'max_attempts', NULL,
      'progress_completed', false
    );
  END IF;

  -- Do not persist a caller result that disagrees with the current threshold.
  -- Only service_role can execute this function, but the invariant belongs in
  -- the transaction that records it.
  IF p_passed IS DISTINCT FROM (p_score_percent >= v_pass_threshold) THEN
    RETURN jsonb_build_object(
      'status', 'invalid_submission',
      'attempt_id', NULL,
      'attempts_used', 0,
      'max_attempts', v_max_attempts,
      'progress_completed', false
    );
  END IF;

  SELECT count(*)
    INTO v_prior_attempts
    FROM public.quiz_attempts a
    WHERE a.user_id = p_user_id AND a.quiz_id = p_quiz_id;

  IF v_max_attempts IS NOT NULL AND v_prior_attempts >= v_max_attempts THEN
    RETURN jsonb_build_object(
      'status', 'max_attempts_reached',
      'attempt_id', NULL,
      'attempts_used', v_prior_attempts,
      'max_attempts', v_max_attempts,
      'progress_completed', false
    );
  END IF;

  INSERT INTO public.quiz_attempts (
    user_id,
    quiz_id,
    score_percent,
    passed,
    answers,
    started_at,
    completed_at,
    created_at
  )
  VALUES (
    p_user_id,
    p_quiz_id,
    p_score_percent,
    p_passed,
    p_answers,
    v_completed_at,
    v_completed_at,
    v_completed_at
  )
  RETURNING id INTO v_attempt_id;

  IF p_passed THEN
    INSERT INTO public.lesson_progress (
      user_id,
      lesson_id,
      is_completed,
      completed_at
    )
    VALUES (
      p_user_id,
      v_lesson_id,
      true,
      v_completed_at
    )
    ON CONFLICT (user_id, lesson_id) DO UPDATE
      SET is_completed = true,
          completed_at = CASE
            WHEN public.lesson_progress.is_completed
              THEN coalesce(public.lesson_progress.completed_at, EXCLUDED.completed_at)
            ELSE EXCLUDED.completed_at
          END
    RETURNING is_completed INTO v_progress_completed;

    IF v_progress_completed IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Quiz progress was not persisted' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'status', 'saved',
    'attempt_id', v_attempt_id,
    'attempts_used', v_prior_attempts + 1,
    'max_attempts', v_max_attempts,
    'progress_completed', v_progress_completed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_quiz_attempt(uuid,uuid,integer,boolean,jsonb,timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_quiz_attempt(uuid,uuid,integer,boolean,jsonb,timestamptz)
  TO service_role;
