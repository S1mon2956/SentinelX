-- Phase 48 (ATOMIC): append-only history of guided-drafting answer changes,
-- plus anchored wording for the 8 stop-trigger prompts.
--
-- Single DO block = one statement, one execution. Any RAISE EXCEPTION rolls
-- back everything. Do NOT add BEGIN/COMMIT. Run once, whole file, nothing
-- highlighted. "Success. No rows returned" only means no error: ALWAYS run
-- the verification queries in the companion notes afterwards.
--
-- Part A: table public.iso_document_answer_history
--   * Written ONLY by a SECURITY DEFINER trigger function on
--     iso_document_answers (INSERT, UPDATE where answer_text changed, DELETE).
--   * DELETE is captured, so removing a "yes" stop answer leaves a trace.
--   * No foreign keys: history must survive deletion of the answer or document.
--   * RLS on; anon/authenticated have no write privilege and no write policy.
--     SELECT is super-admin only (is_super_admin()).
--   * Function: SECURITY DEFINER, search_path pinned, EXECUTE revoked from
--     PUBLIC/anon/authenticated.
-- Part B: UPDATE the 8 stop-trigger prompts (prompt column only) from the
--   single-condition wording to the anchored wording. Aborts unless exactly
--   8 rows currently carry the old wording.

DO $mig$
DECLARE
  v_old constant text := 'Is this unresolved, still being investigated, or not yet reported through your normal channels — rather than something closed, already reported, and being documented after the fact?';
  v_new constant text := 'Before you continue: are you about to describe something that is unresolved, still being investigated, or not yet reported through your normal channels — rather than something closed, already reported, and being documented after the fact?';
  v_n        int;
  v_stop     int;
  v_stop_old int;
  v_updated  int;
BEGIN
  -- ---------- Preflight ----------
  IF to_regclass('public.iso_document_answers') IS NULL THEN
    RAISE EXCEPTION 'Phase 48 aborted: public.iso_document_answers does not exist. Nothing written.';
  END IF;

  IF to_regclass('public.iso_document_answer_history') IS NOT NULL THEN
    RAISE EXCEPTION 'Phase 48 aborted: public.iso_document_answer_history already exists (already applied?). Nothing written.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'is_super_admin'
  ) THEN
    RAISE EXCEPTION 'Phase 48 aborted: public.is_super_admin() not found. Nothing written.';
  END IF;

  SELECT count(*) INTO v_n
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'iso_document_answers'
     AND column_name IN ('id', 'iso_document_id', 'clause_question_id')
     AND data_type = 'uuid';
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'Phase 48 aborted: iso_document_answers id / iso_document_id / clause_question_id are not all uuid (found % of 3). Nothing written.', v_n;
  END IF;

  SELECT count(*) FILTER (WHERE is_stop_trigger),
         count(*) FILTER (WHERE is_stop_trigger AND prompt = v_old)
    INTO v_stop, v_stop_old
    FROM public.iso_clause_questions;
  IF v_stop <> 8 OR v_stop_old <> 8 THEN
    RAISE EXCEPTION 'Phase 48 aborted: expected 8 stop-trigger rows all carrying the old wording; found % stop rows, % with old wording. Nothing written.', v_stop, v_stop_old;
  END IF;

  -- ---------- Part A: history table ----------
  CREATE TABLE public.iso_document_answer_history (
    id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    answer_id          uuid,
    iso_document_id    uuid        NOT NULL,
    clause_question_id uuid        NOT NULL,
    action             text        NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    old_answer         text,
    new_answer         text,
    changed_by         uuid,
    changed_at         timestamptz NOT NULL DEFAULT now()
  );

  CREATE INDEX iso_document_answer_history_lookup_idx
    ON public.iso_document_answer_history (iso_document_id, clause_question_id, changed_at);

  ALTER TABLE public.iso_document_answer_history ENABLE ROW LEVEL SECURITY;

  REVOKE ALL ON public.iso_document_answer_history FROM PUBLIC, anon, authenticated;
  GRANT SELECT ON public.iso_document_answer_history TO authenticated;

  CREATE POLICY iso_document_answer_history_super_admin_select
    ON public.iso_document_answer_history
    FOR SELECT TO authenticated
    USING (public.is_super_admin());

  CREATE FUNCTION public.log_iso_document_answer_change()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $fn$
  BEGIN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO public.iso_document_answer_history
        (answer_id, iso_document_id, clause_question_id, action, old_answer, new_answer, changed_by)
      VALUES
        (NEW.id, NEW.iso_document_id, NEW.clause_question_id, 'INSERT', NULL, NEW.answer_text, auth.uid());
      RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
      IF NEW.answer_text IS DISTINCT FROM OLD.answer_text THEN
        INSERT INTO public.iso_document_answer_history
          (answer_id, iso_document_id, clause_question_id, action, old_answer, new_answer, changed_by)
        VALUES
          (NEW.id, NEW.iso_document_id, NEW.clause_question_id, 'UPDATE', OLD.answer_text, NEW.answer_text, auth.uid());
      END IF;
      RETURN NEW;
    ELSE
      INSERT INTO public.iso_document_answer_history
        (answer_id, iso_document_id, clause_question_id, action, old_answer, new_answer, changed_by)
      VALUES
        (OLD.id, OLD.iso_document_id, OLD.clause_question_id, 'DELETE', OLD.answer_text, NULL, auth.uid());
      RETURN OLD;
    END IF;
  END
  $fn$;

  REVOKE ALL ON FUNCTION public.log_iso_document_answer_change() FROM PUBLIC, anon, authenticated;

  CREATE TRIGGER iso_document_answers_history
    AFTER INSERT OR UPDATE OR DELETE ON public.iso_document_answers
    FOR EACH ROW EXECUTE FUNCTION public.log_iso_document_answer_change();

  -- ---------- Part B: anchored stop-trigger wording ----------
  UPDATE public.iso_clause_questions
     SET prompt = v_new
   WHERE is_stop_trigger = true AND prompt = v_old;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 8 THEN
    RAISE EXCEPTION 'Phase 48 rolled back: updated % stop-trigger rows, expected 8.', v_updated;
  END IF;

  -- ---------- Final assertions ----------
  SELECT count(*) INTO v_n
    FROM public.iso_clause_questions
   WHERE is_stop_trigger AND prompt = v_new;
  IF v_n <> 8 THEN
    RAISE EXCEPTION 'Phase 48 rolled back: % stop rows carry the new wording, expected 8.', v_n;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
     WHERE t.tgrelid = 'public.iso_document_answers'::regclass
       AND t.tgname = 'iso_document_answers_history' AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'Phase 48 rolled back: history trigger not found after creation.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
     WHERE p.oid = 'public.log_iso_document_answer_change()'::regprocedure
       AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'Phase 48 rolled back: history function is not SECURITY DEFINER.';
  END IF;

  RAISE NOTICE 'Phase 48 succeeded: history table + trigger created, 8 stop-trigger prompts updated.';
END
$mig$;
