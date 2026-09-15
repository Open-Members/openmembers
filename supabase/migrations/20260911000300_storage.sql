-- Neutral buckets; file contents come from this installation only.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatars', 'avatars', true, 10485760, ARRAY['image/png','image/jpeg','image/webp']),
  ('platform-assets', 'platform-assets', true, 52428800,
    ARRAY['image/png','image/jpeg','image/webp','image/svg+xml','image/gif','image/x-icon','image/vnd.microsoft.icon']),
  ('lesson-materials', 'lesson-materials', false, 26214400,
    ARRAY['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/zip','application/x-zip-compressed','text/plain','text/csv','image/png','image/jpeg']);

CREATE FUNCTION private.can_write_avatar(p_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT private.is_admin_user() OR (private.is_active_user() AND (
    split_part(p_name, '/', 1) = auth.uid()::text OR
    p_name IN (auth.uid()::text || '.png', auth.uid()::text || '.jpg',
      auth.uid()::text || '.jpeg', auth.uid()::text || '.webp')
  ));
$$;
REVOKE ALL ON FUNCTION private.can_write_avatar(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.can_write_avatar(text) TO authenticated, service_role;

CREATE POLICY openmembers_public_assets ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id IN ('avatars', 'platform-assets'));
CREATE POLICY openmembers_avatar_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND private.can_write_avatar(name));
CREATE POLICY openmembers_avatar_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND private.can_write_avatar(name))
  WITH CHECK (bucket_id = 'avatars' AND private.can_write_avatar(name));
CREATE POLICY openmembers_avatar_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND private.can_write_avatar(name));
CREATE POLICY openmembers_assets_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'platform-assets' AND private.is_admin_user());
CREATE POLICY openmembers_assets_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'platform-assets' AND private.is_admin_user())
  WITH CHECK (bucket_id = 'platform-assets' AND private.is_admin_user());
CREATE POLICY openmembers_assets_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'platform-assets' AND private.is_admin_user());

-- No authenticated/anon policy for lesson-materials. Storage service bypasses
-- RLS only after the application's administrator or lesson-access guard.
