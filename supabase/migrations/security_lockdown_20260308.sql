-- ============================================================
-- Security Lockdown — March 8, 2026
-- Critical hardening for auth/RLS/RPC privilege boundaries.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1) profiles table: enforce RLS and strict access policies
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_self_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_management_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_self_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_service_all" ON public.profiles;

CREATE POLICY "profiles_self_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "profiles_management_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_management());

CREATE POLICY "profiles_self_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_admin_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "profiles_service_all" ON public.profiles
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Extra hard stop for role/team/status tampering.
CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT public.is_owner() THEN
      RAISE EXCEPTION 'Only owner can change roles';
    END IF;
  END IF;

  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only admins can change active status';
    END IF;
  END IF;

  IF NEW.airtable_chatter_id IS DISTINCT FROM OLD.airtable_chatter_id THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only admins can change airtable link';
    END IF;
  END IF;

  IF NEW.team_name IS DISTINCT FROM OLD.team_name THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only admins can change team assignment';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_columns_trigger ON public.profiles;
CREATE TRIGGER protect_profile_columns_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_columns();

-- ────────────────────────────────────────────────────────────
-- 2) save_schedules RPC: remove privilege escalation vector
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.save_schedules(
  p_week_start DATE,
  p_rows JSONB
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_management() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF jsonb_typeof(COALESCE(p_rows, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array';
  END IF;

  DELETE FROM public.schedules
  WHERE week_start = p_week_start;

  IF jsonb_array_length(p_rows) > 0 THEN
    INSERT INTO public.schedules (chatter_id, week_start, day_of_week, shift, created_by)
    SELECT
      (elem->>'chatter_id')::uuid,
      p_week_start,
      (elem->>'day_of_week')::int,
      elem->>'shift',
      auth.uid()
    FROM jsonb_array_elements(p_rows) AS elem
    WHERE (elem->>'day_of_week')::int BETWEEN 0 AND 6
      AND elem->>'shift' IN ('00:00-08:00', '08:00-16:00', '16:00-00:00')
      AND EXISTS (
        SELECT 1
        FROM public.chatters c
        WHERE c.id = (elem->>'chatter_id')::uuid
      );
  END IF;
END;
$$;

-- Restrict execution surface for critical RPCs.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'save_schedules'
      AND pg_get_function_identity_arguments(p.oid) = 'p_week_start date, p_rows jsonb'
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.save_schedules(date, jsonb) FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.save_schedules(date, jsonb) TO authenticated';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'hub_get_users'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.hub_get_users() FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.hub_get_users() TO authenticated';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'hub_set_user_role'
      AND pg_get_function_identity_arguments(p.oid) = 'target_id uuid, new_role text'
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.hub_set_user_role(uuid, text) FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.hub_set_user_role(uuid, text) TO authenticated';
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 3) tasks/comments: close broad read policies
-- ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tasks_select" ON public.tasks;
CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('owner','admin','chatter_manager','team_leader','script_manager','va','personal_assistant')
    )
  );

DROP POLICY IF EXISTS "task_comments_select" ON public.task_comments;
CREATE POLICY "task_comments_select" ON public.task_comments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('owner','admin','chatter_manager','team_leader','script_manager','va','personal_assistant')
    )
  );

-- ────────────────────────────────────────────────────────────
-- 4) shift reports: remove permissive authenticated-all access
-- ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can read shift_reports" ON public.shift_reports;
DROP POLICY IF EXISTS "Authenticated users can insert shift_reports" ON public.shift_reports;
DROP POLICY IF EXISTS "Authenticated users can update shift_reports" ON public.shift_reports;

DROP POLICY IF EXISTS "sr_management_select" ON public.shift_reports;
DROP POLICY IF EXISTS "sr_chatter_own_select" ON public.shift_reports;
DROP POLICY IF EXISTS "sr_management_insert" ON public.shift_reports;
DROP POLICY IF EXISTS "sr_chatter_own_insert" ON public.shift_reports;
DROP POLICY IF EXISTS "sr_management_update" ON public.shift_reports;
DROP POLICY IF EXISTS "sr_admin_delete" ON public.shift_reports;
DROP POLICY IF EXISTS "sr_service_all" ON public.shift_reports;

CREATE POLICY "sr_management_select" ON public.shift_reports
  FOR SELECT USING (public.is_management());

CREATE POLICY "sr_chatter_own_select" ON public.shift_reports
  FOR SELECT USING (
    submitted_by = auth.uid()
    OR chatter_id = public.get_my_chatter_id()
  );

CREATE POLICY "sr_management_insert" ON public.shift_reports
  FOR INSERT WITH CHECK (public.is_management());

CREATE POLICY "sr_chatter_own_insert" ON public.shift_reports
  FOR INSERT WITH CHECK (
    submitted_by = auth.uid()
    AND chatter_id = public.get_my_chatter_id()
  );

CREATE POLICY "sr_management_update" ON public.shift_reports
  FOR UPDATE USING (public.is_management());

CREATE POLICY "sr_admin_delete" ON public.shift_reports
  FOR DELETE USING (public.is_admin());

CREATE POLICY "sr_service_all" ON public.shift_reports
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can read shift_report_alerts" ON public.shift_report_alerts;
DROP POLICY IF EXISTS "Authenticated users can insert shift_report_alerts" ON public.shift_report_alerts;

DROP POLICY IF EXISTS "sra_admin_select" ON public.shift_report_alerts;
DROP POLICY IF EXISTS "sra_admin_insert" ON public.shift_report_alerts;
DROP POLICY IF EXISTS "sra_service_all" ON public.shift_report_alerts;

CREATE POLICY "sra_admin_select" ON public.shift_report_alerts
  FOR SELECT USING (public.is_admin());

CREATE POLICY "sra_admin_insert" ON public.shift_report_alerts
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "sra_service_all" ON public.shift_report_alerts
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 5) announcements: never public, authenticated + role scoped
-- ────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regclass('public.announcements') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "announcements_read" ON public.announcements';
    EXECUTE $sql$
      CREATE POLICY "announcements_read" ON public.announcements
      FOR SELECT TO authenticated
      USING (
        auth.uid() IS NOT NULL
        AND (
          COALESCE(array_length(target_roles, 1), 0) = 0
          OR EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role = ANY(target_roles)
          )
        )
      )
    $sql$;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 5b) Remove legacy public-read score policies
-- ────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regclass('public.score_config') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS score_config_select ON public.score_config';
  END IF;

  IF to_regclass('public.score_event_types') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS score_event_types_select ON public.score_event_types';
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 6) Optional hardening for sensitive tables that may exist
--    in production but are not guaranteed in this repo schema.
-- ────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- model_scripts
  IF to_regclass('public.model_scripts') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.model_scripts ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.model_scripts FORCE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS ms_select ON public.model_scripts';
    EXECUTE 'DROP POLICY IF EXISTS ms_write ON public.model_scripts';
    EXECUTE $sql$
      CREATE POLICY ms_select ON public.model_scripts
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.role IN ('owner','admin','team_leader','script_manager','chatter')
            AND COALESCE(p.is_active, true) = true
        )
      )
    $sql$;
    EXECUTE $sql$
      CREATE POLICY ms_write ON public.model_scripts
      FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.role IN ('owner','admin','script_manager')
            AND COALESCE(p.is_active, true) = true
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.role IN ('owner','admin','script_manager')
            AND COALESCE(p.is_active, true) = true
        )
      )
    $sql$;
  END IF;

  -- model_important_notes
  IF to_regclass('public.model_important_notes') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.model_important_notes ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.model_important_notes FORCE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS min_select ON public.model_important_notes';
    EXECUTE 'DROP POLICY IF EXISTS min_write ON public.model_important_notes';
    EXECUTE $sql$
      CREATE POLICY min_select ON public.model_important_notes
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.role IN ('owner','admin','team_leader','script_manager','chatter')
            AND COALESCE(p.is_active, true) = true
        )
      )
    $sql$;
    EXECUTE $sql$
      CREATE POLICY min_write ON public.model_important_notes
      FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.role IN ('owner','admin','script_manager','team_leader')
            AND COALESCE(p.is_active, true) = true
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.role IN ('owner','admin','script_manager','team_leader')
            AND COALESCE(p.is_active, true) = true
        )
      )
    $sql$;
  END IF;

  -- invite_codes
  IF to_regclass('public.invite_codes') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.invite_codes FORCE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS ic_select_admin ON public.invite_codes';
    EXECUTE 'DROP POLICY IF EXISTS ic_write_admin ON public.invite_codes';
    EXECUTE $sql$
      CREATE POLICY ic_select_admin ON public.invite_codes
      FOR SELECT TO authenticated
      USING (public.is_admin())
    $sql$;
    EXECUTE $sql$
      CREATE POLICY ic_write_admin ON public.invite_codes
      FOR ALL TO authenticated
      USING (public.is_admin())
      WITH CHECK (public.is_admin())
    $sql$;
  END IF;

  -- invite_code_uses
  IF to_regclass('public.invite_code_uses') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.invite_code_uses ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.invite_code_uses FORCE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS icu_admin_all ON public.invite_code_uses';
    EXECUTE $sql$
      CREATE POLICY icu_admin_all ON public.invite_code_uses
      FOR ALL TO authenticated
      USING (public.is_admin())
      WITH CHECK (public.is_admin())
    $sql$;
  END IF;

  -- impersonation_log
  IF to_regclass('public.impersonation_log') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.impersonation_log ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.impersonation_log FORCE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS il_owner_all ON public.impersonation_log';
    EXECUTE $sql$
      CREATE POLICY il_owner_all ON public.impersonation_log
      FOR ALL TO authenticated
      USING (public.is_owner())
      WITH CHECK (public.is_owner())
    $sql$;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 7) Storage screenshots: ensure not public-readable
-- ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Public read for hubstaff screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated read for hubstaff screenshots" ON storage.objects;
CREATE POLICY "Authenticated read for hubstaff screenshots"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'hubstaff-screenshots');

-- ────────────────────────────────────────────────────────────
-- 8) Force RLS on critical application tables
-- ────────────────────────────────────────────────────────────

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles',
    'models',
    'model_metrics',
    'chatters',
    'schedules',
    'model_chatter_assignments',
    'chatter_hours',
    'csv_uploads',
    'documents',
    'tasks',
    'task_comments',
    'announcements',
    'notifications',
    'coaching_tasks',
    'coaching_logs',
    'model_daily_stats',
    'chatter_daily_stats',
    'score_config',
    'score_event_types',
    'score_events',
    'score_weekly_reports',
    'shift_reports',
    'shift_report_alerts',
    'hubstaff_issues'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────
-- 9) Restrict RPC execution surface (default deny anon/public)
-- ────────────────────────────────────────────────────────────

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS fn
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'hub_get_users',
        'hub_set_user_role',
        'hub_set_user_active',
        'hub_link_chatter',
        'save_schedules',
        'generate_invite_code',
        'signup_with_invite',
        'validate_invite_code',
        'use_invite_code',
        'admin_get_invite_codes',
        'admin_get_students',
        'admin_get_unlocks',
        'admin_grant_section',
        'admin_reset_progress',
        'admin_reset_quizzes',
        'admin_revoke_section',
        'admin_set_active'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.fn);
  END LOOP;
END $$;

COMMIT;
