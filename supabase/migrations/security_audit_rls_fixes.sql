-- ============================================================
-- Security Audit RLS Fixes — March 2026
-- Run this ENTIRE script in Supabase SQL Editor
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. shift_reports — Replace overly permissive policies
-- ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can read shift_reports" ON shift_reports;
DROP POLICY IF EXISTS "Authenticated users can insert shift_reports" ON shift_reports;
DROP POLICY IF EXISTS "Authenticated users can update shift_reports" ON shift_reports;

-- Management (owner, admin, chatter_manager, team_leader) can see all reports
CREATE POLICY "sr_management_select" ON shift_reports
  FOR SELECT USING (public.is_management());

-- Chatters can see their own reports (by chatter_id or submitted_by)
CREATE POLICY "sr_chatter_own_select" ON shift_reports
  FOR SELECT USING (
    submitted_by = auth.uid()
    OR chatter_id = public.get_my_chatter_id()
  );

-- Management can insert reports for any chatter
CREATE POLICY "sr_management_insert" ON shift_reports
  FOR INSERT WITH CHECK (public.is_management());

-- Chatters can only insert their own reports
CREATE POLICY "sr_chatter_own_insert" ON shift_reports
  FOR INSERT WITH CHECK (
    submitted_by = auth.uid()
    AND chatter_id = public.get_my_chatter_id()
  );

-- Only management can update reports
CREATE POLICY "sr_management_update" ON shift_reports
  FOR UPDATE USING (public.is_management());

-- Only admin (owner/admin) can delete reports
CREATE POLICY "sr_admin_delete" ON shift_reports
  FOR DELETE USING (public.is_admin());

-- Service role bypass
CREATE POLICY "sr_service_all" ON shift_reports
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ────────────────────────────────────────────────────────────
-- 2. shift_report_alerts — Replace overly permissive policies
-- ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can read shift_report_alerts" ON shift_report_alerts;
DROP POLICY IF EXISTS "Authenticated users can insert shift_report_alerts" ON shift_report_alerts;

-- Only admin (owner/admin) can read alerts
CREATE POLICY "sra_admin_select" ON shift_report_alerts
  FOR SELECT USING (public.is_admin());

-- Only admin can insert alerts (resolve missing report actions)
CREATE POLICY "sra_admin_insert" ON shift_report_alerts
  FOR INSERT WITH CHECK (public.is_admin());

-- Service role bypass
CREATE POLICY "sra_service_all" ON shift_report_alerts
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ────────────────────────────────────────────────────────────
-- 3. tasks — Replace open SELECT with role-restricted policy
-- ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tasks_select" ON tasks;

CREATE POLICY "tasks_select" ON tasks
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('owner','admin','chatter_manager','team_leader','script_manager','va','personal_assistant')
    )
  );


-- ────────────────────────────────────────────────────────────
-- 4. task_comments — Replace open SELECT with role-restricted
-- ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "task_comments_select" ON task_comments;

CREATE POLICY "task_comments_select" ON task_comments
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('owner','admin','chatter_manager','team_leader','script_manager','va','personal_assistant')
    )
  );


-- ────────────────────────────────────────────────────────────
-- 5. hubstaff-screenshots storage — Remove public read access
-- ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Public read for hubstaff screenshots" ON storage.objects;

CREATE POLICY "Authenticated read for hubstaff screenshots"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'hubstaff-screenshots');


-- ────────────────────────────────────────────────────────────
-- 6. profiles — Prevent role self-escalation via direct API
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS protect_profile_columns_trigger ON public.profiles;

CREATE TRIGGER protect_profile_columns_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_columns();
