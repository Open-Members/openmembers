-- Existing rows represented completed deliveries; keep that meaning.
ALTER TABLE public.processed_webhook_events
  ADD COLUMN status text NOT NULL DEFAULT 'processed' CHECK (status IN ('pending','processing','processed')),
  ADD COLUMN claim_token uuid,
  ADD COLUMN lease_until timestamptz;

CREATE FUNCTION public.claim_webhook_event(p_provider text, p_event_id text, p_event_type text, p_token uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_status text;
BEGIN
  INSERT INTO public.processed_webhook_events(provider,external_event_id,event_type,status,claim_token,lease_until)
    VALUES(p_provider,p_event_id,p_event_type,'processing',p_token,now()+interval '5 minutes')
    ON CONFLICT (provider,external_event_id) DO NOTHING;
  IF FOUND THEN RETURN 'claimed'; END IF;
  UPDATE public.processed_webhook_events SET status='processing',claim_token=p_token,lease_until=now()+interval '5 minutes'
    WHERE provider=p_provider AND external_event_id=p_event_id
      AND (status='pending' OR (status='processing' AND lease_until < now()));
  IF FOUND THEN RETURN 'claimed'; END IF;
  SELECT status INTO v_status FROM public.processed_webhook_events WHERE provider=p_provider AND external_event_id=p_event_id;
  RETURN CASE WHEN v_status='processed' THEN 'processed' ELSE 'busy' END;
END $$;

CREATE FUNCTION public.finish_webhook_event(p_provider text, p_event_id text, p_token uuid, p_success boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.processed_webhook_events
    SET status=CASE WHEN p_success THEN 'processed' ELSE 'pending' END,
        processed_at=CASE WHEN p_success THEN now() ELSE processed_at END,
        claim_token=NULL,lease_until=NULL
    WHERE provider=p_provider AND external_event_id=p_event_id AND status='processing' AND claim_token=p_token;
  RETURN FOUND;
END $$;

-- The receipt and access mutation commit together. Event completion may safely retry.
CREATE TABLE public.webhook_enrollment_receipts (
  provider text NOT NULL,
  transaction_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  access_level_id uuid NOT NULL REFERENCES public.access_levels(id) ON DELETE RESTRICT,
  enrollment_id uuid NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider,transaction_id)
);
ALTER TABLE public.webhook_enrollment_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.webhook_enrollment_receipts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.webhook_enrollment_receipts TO service_role;

CREATE FUNCTION public.apply_payment_enrollment(p_provider text,p_transaction_id text,p_user_id uuid,
  p_access_level_id uuid,p_product_id text,p_expires_at timestamptz,p_mapping_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_receipt public.webhook_enrollment_receipts; v_enrollment_id uuid;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_provider || ':' || p_transaction_id,0));
  SELECT * INTO v_receipt FROM public.webhook_enrollment_receipts WHERE provider=p_provider AND transaction_id=p_transaction_id;
  IF FOUND THEN
    IF v_receipt.user_id <> p_user_id OR v_receipt.access_level_id <> p_access_level_id THEN
      RAISE EXCEPTION 'Transaction already applied to a different account or access level' USING ERRCODE='23505';
    END IF;
    RETURN jsonb_build_object('enrollment_id',v_receipt.enrollment_id,'duplicate',true);
  END IF;
  -- Adopt pre-E4 enrollments without extending their dates or reactivating them.
  SELECT id INTO v_enrollment_id FROM public.enrollments WHERE source=p_provider AND source_transaction_id=p_transaction_id
    AND user_id=p_user_id AND access_level_id=p_access_level_id;
  IF FOUND THEN
    INSERT INTO public.webhook_enrollment_receipts VALUES(p_provider,p_transaction_id,p_user_id,p_access_level_id,v_enrollment_id,now());
    RETURN jsonb_build_object('enrollment_id',v_enrollment_id,'duplicate',true);
  END IF;
  INSERT INTO public.enrollments(user_id,access_level_id,source,source_transaction_id,external_product_id,expires_at)
    VALUES(p_user_id,p_access_level_id,p_provider,p_transaction_id,p_product_id,p_expires_at)
    ON CONFLICT(user_id,access_level_id) DO UPDATE SET source=EXCLUDED.source,source_transaction_id=EXCLUDED.source_transaction_id,
      external_product_id=EXCLUDED.external_product_id,enrolled_at=now(),expires_at=EXCLUDED.expires_at,is_active=true,
      revoked_at=NULL,revocation_reason=NULL,updated_at=now()
    RETURNING id INTO v_enrollment_id;
  IF p_mapping_id IS NOT NULL THEN
    INSERT INTO public.enrollment_cohorts(enrollment_id,course_id,cohort_id)
      SELECT v_enrollment_id,course_id,cohort_id FROM public.webhook_product_mapping_cohorts WHERE mapping_id=p_mapping_id
      ON CONFLICT(enrollment_id,course_id) DO UPDATE SET cohort_id=EXCLUDED.cohort_id;
  END IF;
  INSERT INTO public.webhook_enrollment_receipts VALUES(p_provider,p_transaction_id,p_user_id,p_access_level_id,v_enrollment_id,now());
  RETURN jsonb_build_object('enrollment_id',v_enrollment_id,'duplicate',false);
END $$;

REVOKE ALL ON FUNCTION public.claim_webhook_event(text,text,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.finish_webhook_event(text,text,uuid,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.apply_payment_enrollment(text,text,uuid,uuid,text,timestamptz,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_webhook_event(text,text,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_webhook_event(text,text,uuid,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_payment_enrollment(text,text,uuid,uuid,text,timestamptz,uuid) TO service_role;

CREATE FUNCTION public.mutate_payment_enrollment(p_provider text,p_transaction_id text,p_kind text,p_expires_at timestamptz,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_row public.enrollments;
BEGIN
  IF p_kind NOT IN ('revoke','expire','renew') THEN RAISE EXCEPTION 'Invalid payment action'; END IF;
  IF p_kind='revoke' AND (p_reason IS NULL OR p_reason NOT IN ('refund','chargeback','dispute','cancelled','fraud')) THEN
    RAISE EXCEPTION 'Invalid revocation reason';
  END IF;
  IF p_kind IN ('expire','renew') AND p_expires_at IS NULL THEN RAISE EXCEPTION 'Missing expiry'; END IF;
  SELECT * INTO v_row FROM public.enrollments
    WHERE source=p_provider AND source_transaction_id=p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('found',false); END IF;
  IF p_kind='revoke' THEN
    -- Even an already-expired row needs a definitive reason to prevent resurrection.
    UPDATE public.enrollments SET is_active=false,revoked_at=coalesce(revoked_at,now()),
      revocation_reason=CASE WHEN revocation_reason IS NULL OR revocation_reason='cancelled' THEN p_reason ELSE revocation_reason END,
      updated_at=now() WHERE id=v_row.id;
  ELSIF v_row.revocation_reason IS NULL OR v_row.revocation_reason='cancelled' THEN
    UPDATE public.enrollments SET expires_at=greatest(expires_at,p_expires_at),
      is_active=CASE WHEN p_kind='renew' THEN true ELSE is_active END,
      revoked_at=CASE WHEN p_kind='renew' THEN NULL ELSE revoked_at END,
      revocation_reason=CASE WHEN p_kind='renew' THEN NULL ELSE revocation_reason END,
      updated_at=now() WHERE id=v_row.id;
  END IF;
  RETURN jsonb_build_object('found',true,'enrollmentId',v_row.id);
END $$;
REVOKE ALL ON FUNCTION public.mutate_payment_enrollment(text,text,text,timestamptz,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mutate_payment_enrollment(text,text,text,timestamptz,text) TO service_role;
