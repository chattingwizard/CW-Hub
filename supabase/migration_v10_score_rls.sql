-- ============================================================
-- Migration v10: Fix RLS policies for all score tables
-- These tables were created manually in Supabase without proper
-- INSERT/UPDATE/DELETE policies, causing silent insert failures.
-- ============================================================

-- ── 1. score_config ─────────────────────────────────────────
-- Single-row config table. Management can read, admin can write.

ALTER TABLE public.score_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "score_config_management_select" ON public.score_config;
CREATE POLICY "score_config_management_select" ON public.score_config
  FOR SELECT USING (public.is_management());

DROP POLICY IF EXISTS "score_config_admin_update" ON public.score_config;
CREATE POLICY "score_config_admin_update" ON public.score_config
  FOR UPDATE USING (public.is_admin());

DROP POLICY IF EXISTS "score_config_admin_insert" ON public.score_config;
CREATE POLICY "score_config_admin_insert" ON public.score_config
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "score_config_service_all" ON public.score_config;
CREATE POLICY "score_config_service_all" ON public.score_config
  FOR ALL USING (auth.role() = 'service_role');

-- ── 2. score_event_types ────────────────────────────────────
-- Event type definitions. Management reads, admin writes.

ALTER TABLE public.score_event_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "score_event_types_management_select" ON public.score_event_types;
CREATE POLICY "score_event_types_management_select" ON public.score_event_types
  FOR SELECT USING (public.is_management());

DROP POLICY IF EXISTS "score_event_types_admin_insert" ON public.score_event_types;
CREATE POLICY "score_event_types_admin_insert" ON public.score_event_types
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "score_event_types_admin_update" ON public.score_event_types;
CREATE POLICY "score_event_types_admin_update" ON public.score_event_types
  FOR UPDATE USING (public.is_admin());

DROP POLICY IF EXISTS "score_event_types_admin_delete" ON public.score_event_types;
CREATE POLICY "score_event_types_admin_delete" ON public.score_event_types
  FOR DELETE USING (public.is_admin());

DROP POLICY IF EXISTS "score_event_types_service_all" ON public.score_event_types;
CREATE POLICY "score_event_types_service_all" ON public.score_event_types
  FOR ALL USING (auth.role() = 'service_role');

-- ── 3. score_events ─────────────────────────────────────────
-- Individual score events. Management can CRUD.

ALTER TABLE public.score_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "score_events_management_select" ON public.score_events;
CREATE POLICY "score_events_management_select" ON public.score_events
  FOR SELECT USING (public.is_management());

DROP POLICY IF EXISTS "score_events_management_insert" ON public.score_events;
CREATE POLICY "score_events_management_insert" ON public.score_events
  FOR INSERT WITH CHECK (public.is_management());

DROP POLICY IF EXISTS "score_events_management_update" ON public.score_events;
CREATE POLICY "score_events_management_update" ON public.score_events
  FOR UPDATE USING (public.is_management());

DROP POLICY IF EXISTS "score_events_management_delete" ON public.score_events;
CREATE POLICY "score_events_management_delete" ON public.score_events
  FOR DELETE USING (public.is_management());

-- Chatters can see their own events (for ChatterDashboard)
DROP POLICY IF EXISTS "score_events_chatter_own" ON public.score_events;
CREATE POLICY "score_events_chatter_own" ON public.score_events
  FOR SELECT USING (
    chatter_id = public.get_my_chatter_id()
  );

DROP POLICY IF EXISTS "score_events_service_all" ON public.score_events;
CREATE POLICY "score_events_service_all" ON public.score_events
  FOR ALL USING (auth.role() = 'service_role');

-- ── 4. score_weekly_reports ─────────────────────────────────
-- Weekly report points. Management can CRUD.

ALTER TABLE public.score_weekly_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "score_weekly_reports_management_select" ON public.score_weekly_reports;
CREATE POLICY "score_weekly_reports_management_select" ON public.score_weekly_reports
  FOR SELECT USING (public.is_management());

DROP POLICY IF EXISTS "score_weekly_reports_management_insert" ON public.score_weekly_reports;
CREATE POLICY "score_weekly_reports_management_insert" ON public.score_weekly_reports
  FOR INSERT WITH CHECK (public.is_management());

DROP POLICY IF EXISTS "score_weekly_reports_management_update" ON public.score_weekly_reports;
CREATE POLICY "score_weekly_reports_management_update" ON public.score_weekly_reports
  FOR UPDATE USING (public.is_management());

DROP POLICY IF EXISTS "score_weekly_reports_management_delete" ON public.score_weekly_reports;
CREATE POLICY "score_weekly_reports_management_delete" ON public.score_weekly_reports
  FOR DELETE USING (public.is_management());

-- Chatters can see their own weekly reports
DROP POLICY IF EXISTS "score_weekly_reports_chatter_own" ON public.score_weekly_reports;
CREATE POLICY "score_weekly_reports_chatter_own" ON public.score_weekly_reports
  FOR SELECT USING (
    chatter_id = public.get_my_chatter_id()
  );

DROP POLICY IF EXISTS "score_weekly_reports_service_all" ON public.score_weekly_reports;
CREATE POLICY "score_weekly_reports_service_all" ON public.score_weekly_reports
  FOR ALL USING (auth.role() = 'service_role');

-- ── 5. Indexes for score tables ─────────────────────────────

CREATE INDEX IF NOT EXISTS idx_score_events_week ON public.score_events(week);
CREATE INDEX IF NOT EXISTS idx_score_events_chatter ON public.score_events(chatter_id);
CREATE INDEX IF NOT EXISTS idx_score_weekly_reports_week ON public.score_weekly_reports(week);
CREATE INDEX IF NOT EXISTS idx_score_weekly_reports_chatter ON public.score_weekly_reports(chatter_id);

-- ============================================================
-- Run this in the Supabase SQL Editor against production.
-- ============================================================
