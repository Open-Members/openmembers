-- Automatic notifications keep an English snapshot for recovery while these
-- nullable descriptors allow rendering in the account's current language.
ALTER TABLE public.notifications
  ADD COLUMN message_key text,
  ADD COLUMN message_params jsonb;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_message_descriptor_check CHECK (
    (message_key IS NULL AND message_params IS NULL)
    OR (
      message_key IS NOT NULL
      AND char_length(message_key) BETWEEN 1 AND 120
      AND message_params IS NOT NULL
      AND jsonb_typeof(message_params) = 'object'
    )
  );

COMMENT ON COLUMN public.notifications.message_key IS
  'Optional application-owned translation key. Null identifies literal/legacy content.';
COMMENT ON COLUMN public.notifications.message_params IS
  'Validated interpolation parameters for message_key; title/message remain the English recovery snapshot.';
