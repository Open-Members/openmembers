-- New nullable identity preserves all existing notifications and their RLS.
ALTER TABLE public.notifications ADD COLUMN dedupe_key text;
CREATE UNIQUE INDEX notifications_user_dedupe_idx ON public.notifications (user_id, dedupe_key);
COMMENT ON COLUMN public.notifications.dedupe_key IS 'Optional stable event identity for idempotent scheduled notifications.';
