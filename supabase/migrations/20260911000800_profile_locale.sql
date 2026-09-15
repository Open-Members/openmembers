-- Additive: preserve existing profiles and let their cookie/browser preference
-- apply until they explicitly choose an account language in Settings.
ALTER TABLE public.profiles
  ADD COLUMN preferred_locale text
  CONSTRAINT profiles_preferred_locale_check CHECK (preferred_locale IN ('en', 'pt', 'es'));

-- Existing self-only RLS and protected identity fields remain in force.
GRANT UPDATE (preferred_locale) ON public.profiles TO authenticated;
