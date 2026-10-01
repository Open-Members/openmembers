-- Additive: NULL retains each screen's current appearance; RLS stays admin-only.
CREATE FUNCTION private.valid_entry_background(value jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
BEGIN
  IF value IS NULL THEN RETURN true; END IF;
  IF jsonb_typeof(value) <> 'object' THEN RETURN false; END IF;
  IF value->>'mode' = 'color' THEN
    RETURN jsonb_typeof(value->'color') = 'string'
      AND value->>'color' ~ '^#[0-9a-fA-F]{6}$'
      AND value - ARRAY['mode','color'] = '{}'::jsonb;
  ELSIF value->>'mode' = 'image' THEN
    IF jsonb_typeof(value->'imageUrl') IS DISTINCT FROM 'string'
      OR length(value->>'imageUrl') > 2048
      OR NOT (value->>'imageUrl' ~ '^(https?://[^[:space:]]+|/[^/][^[:space:]]*)$')
      OR jsonb_typeof(value->'position') IS DISTINCT FROM 'string'
      OR value->>'position' NOT IN ('center','top','bottom')
      OR jsonb_typeof(value->'overlayOpacity') IS DISTINCT FROM 'number'
      OR value - ARRAY['mode','imageUrl','position','overlayOpacity'] <> '{}'::jsonb
    THEN RETURN false; END IF;
    RETURN (value->>'overlayOpacity')::numeric BETWEEN 0 AND 100
      AND trunc((value->>'overlayOpacity')::numeric) = (value->>'overlayOpacity')::numeric;
  END IF;
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION private.valid_entry_background(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.valid_entry_background(jsonb) TO authenticated, service_role;

ALTER TABLE public.tenant_settings
  ADD COLUMN heading_font_family text CHECK (heading_font_family IN ('inherit','system','serif','mono','inter','montserrat','lora')),
  ADD COLUMN button_shape text CHECK (button_shape IN ('square','rounded','pill')),
  ADD COLUMN public_home_title text CHECK (length(public_home_title) <= 180),
  ADD COLUMN public_home_description text CHECK (length(public_home_description) <= 1200),
  ADD COLUMN public_home_background jsonb CHECK (private.valid_entry_background(public_home_background) IS TRUE),
  ADD COLUMN login_background jsonb CHECK (private.valid_entry_background(login_background) IS TRUE),
  ADD COLUMN register_background jsonb CHECK (private.valid_entry_background(register_background) IS TRUE);

NOTIFY pgrst, 'reload schema';
