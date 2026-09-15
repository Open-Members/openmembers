-- Drip rules must describe one course hierarchy, including future edits.
CREATE FUNCTION private.validate_drip_rule_hierarchy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_course_id uuid;
  v_module_id uuid;
BEGIN
  IF NEW.module_id IS NOT NULL THEN
    SELECT m.course_id INTO v_course_id FROM public.modules m
      WHERE m.id = NEW.module_id FOR SHARE;
    IF NOT FOUND OR v_course_id <> NEW.course_id THEN
      RAISE EXCEPTION 'Drip module must belong to its course' USING ERRCODE = '23503';
    END IF;
  END IF;
  IF NEW.lesson_id IS NOT NULL THEN
    SELECT l.module_id, m.course_id INTO v_module_id, v_course_id
      FROM public.lessons l JOIN public.modules m ON m.id = l.module_id
      WHERE l.id = NEW.lesson_id FOR SHARE OF l, m;
    IF NOT FOUND OR v_course_id <> NEW.course_id
       OR (NEW.module_id IS NOT NULL AND v_module_id <> NEW.module_id) THEN
      RAISE EXCEPTION 'Drip lesson must belong to its course and specified module' USING ERRCODE = '23503';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_drip_rule_hierarchy BEFORE INSERT OR UPDATE OF course_id, module_id, lesson_id
  ON public.drip_rules FOR EACH ROW EXECUTE FUNCTION private.validate_drip_rule_hierarchy();

-- Moving content must not leave an existing rule referring to a different tree.
CREATE FUNCTION private.protect_drip_parent_hierarchy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_course_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'modules' THEN
    IF NEW.course_id IS NOT DISTINCT FROM OLD.course_id THEN RETURN NEW; END IF;
    IF EXISTS (
      SELECT 1 FROM public.drip_rules r
      WHERE r.course_id <> NEW.course_id AND (
        r.module_id = OLD.id OR EXISTS (
          SELECT 1 FROM public.lessons l WHERE l.id = r.lesson_id AND l.module_id = OLD.id
        )
      )
    ) THEN
      RAISE EXCEPTION 'Moving this module would invalidate a drip rule' USING ERRCODE = '23503';
    END IF;
  ELSIF TG_TABLE_NAME = 'lessons' THEN
    IF NEW.module_id IS NOT DISTINCT FROM OLD.module_id THEN RETURN NEW; END IF;
    SELECT m.course_id INTO v_course_id FROM public.modules m WHERE m.id = NEW.module_id FOR SHARE;
    IF EXISTS (
      SELECT 1 FROM public.drip_rules r WHERE r.lesson_id = OLD.id AND (
        r.course_id <> v_course_id OR (r.module_id IS NOT NULL AND r.module_id <> NEW.module_id)
      )
    ) THEN
      RAISE EXCEPTION 'Moving this lesson would invalidate a drip rule' USING ERRCODE = '23503';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_drip_module_parent BEFORE UPDATE OF course_id ON public.modules
  FOR EACH ROW EXECUTE FUNCTION private.protect_drip_parent_hierarchy();
CREATE TRIGGER protect_drip_lesson_parent BEFORE UPDATE OF module_id ON public.lessons
  FOR EACH ROW EXECUTE FUNCTION private.protect_drip_parent_hierarchy();

REVOKE ALL ON FUNCTION private.validate_drip_rule_hierarchy(), private.protect_drip_parent_hierarchy()
  FROM PUBLIC, anon, authenticated;
