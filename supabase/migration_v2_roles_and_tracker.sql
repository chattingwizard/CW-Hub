-- ============================================================
-- CW Hub — Migration v2: Expanded Roles + Tracker Preparation
-- ============================================================
-- Run AFTER migration_fixed.sql
-- This migration:
-- 1. Expands roles from 4 to 9
-- 2. Adds avatar_url to profiles
-- 3. Creates notifications table
-- 4. Creates announcements table
-- 5. Creates chatter_sessions table (Tracker integration)
-- 6. Updates helper functions for new roles
-- 7. Updates RLS policies
-- 8. Adds assignment_group to model_chatter_assignments
-- ============================================================

-- ── 1. Expand Role Constraint ────────────────────────────────

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'owner', 'admin', 'chatter_manager', 'team_leader',
    'script_manager', 'va', 'personal_assistant',
    'chatter', 'recruit'
  ));

-- ── 2. New Profile Columns ───────────────────────────────────

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- ── 3. Update Helper Functions ───────────────────────────────

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'owner')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_management()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('owner', 'admin', 'chatter_manager', 'team_leader')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_leadership()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('owner', 'admin', 'chatter_manager')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.can_upload()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('owner', 'admin', 'chatter_manager', 'personal_assistant')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ── 4. Update hub_set_user_role for new roles ────────────────

CREATE OR REPLACE FUNCTION public.hub_set_user_role(target_id UUID, new_role TEXT)
RETURNS VOID AS $$
BEGIN
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'Only owner can change roles';
  END IF;
  IF new_role NOT IN (
    'owner', 'admin', 'chatter_manager', 'team_leader',
    'script_manager', 'va', 'personal_assistant',
    'chatter', 'recruit'
  ) THEN
    RAISE EXCEPTION 'Invalid role: %', new_role;
  END IF;
  UPDATE public.profiles SET role = new_role WHERE id = target_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 5. Update hub_get_users with new role ordering ───────────

CREATE OR REPLACE FUNCTION public.hub_get_users()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  SELECT json_agg(row_to_json(t)) INTO result
  FROM (
    SELECT p.id, p.email, p.full_name, p.role, p.team_name,
           p.is_active, p.airtable_chatter_id, p.avatar_url, p.created_at
    FROM public.profiles p
    ORDER BY CASE p.role
      WHEN 'owner' THEN 1
      WHEN 'admin' THEN 2
      WHEN 'chatter_manager' THEN 3
      WHEN 'team_leader' THEN 4
      WHEN 'script_manager' THEN 5
      WHEN 'personal_assistant' THEN 6
      WHEN 'va' THEN 7
      WHEN 'chatter' THEN 8
      WHEN 'recruit' THEN 9
    END, p.full_name
  ) t;
  RETURN COALESCE(result, '[]'::JSON);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 6. Notifications Table ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('coaching', 'schedule', 'alert', 'announcement', 'system')),
  title TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  read BOOLEAN DEFAULT FALSE,
  action_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_own_select" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "notifications_own_update" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "notifications_admin_insert" ON public.notifications
  FOR INSERT WITH CHECK (public.is_management());
CREATE POLICY "notifications_service_write" ON public.notifications
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, read, created_at DESC);

-- ── 7. Announcements Table ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  author_id UUID REFERENCES public.profiles(id) NOT NULL,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('normal', 'important', 'urgent')),
  target_roles TEXT[] DEFAULT '{}',
  pinned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "announcements_read" ON public.announcements
  FOR SELECT USING (
    target_roles = '{}' OR
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = ANY(target_roles)
    )
  );
CREATE POLICY "announcements_leadership_write" ON public.announcements
  FOR INSERT WITH CHECK (public.is_leadership());
CREATE POLICY "announcements_leadership_update" ON public.announcements
  FOR UPDATE USING (public.is_leadership());
CREATE POLICY "announcements_owner_delete" ON public.announcements
  FOR DELETE USING (public.is_owner());

CREATE INDEX IF NOT EXISTS idx_announcements_created ON public.announcements(created_at DESC);

-- ── 8. Chatter Sessions (Tracker prep) ───────────────────────
-- This table will receive data from the CW Tracker when integrated.
-- Until then it can be populated manually or left empty.

CREATE TABLE IF NOT EXISTS public.chatter_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chatter_id UUID REFERENCES public.chatters(id) ON DELETE CASCADE NOT NULL,
  clock_in TIMESTAMPTZ NOT NULL,
  clock_out TIMESTAMPTZ,
  total_seconds INT,
  break_seconds INT DEFAULT 0,
  active_seconds INT,
  avg_activity_pct NUMERIC(5,2),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'on_break', 'completed', 'disconnected')),
  source TEXT DEFAULT 'manual' CHECK (source IN ('tracker', 'manual')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.chatter_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sessions_management_select" ON public.chatter_sessions
  FOR SELECT USING (public.is_management());
CREATE POLICY "sessions_chatter_own" ON public.chatter_sessions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.chatters c WHERE c.id = chatter_sessions.chatter_id AND c.profile_id = auth.uid())
  );
CREATE POLICY "sessions_service_write" ON public.chatter_sessions
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_sessions_chatter ON public.chatter_sessions(chatter_id, clock_in DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON public.chatter_sessions(status) WHERE status IN ('active', 'on_break');

-- ── 9. Add assignment_group to assignments ───────────────────

ALTER TABLE public.model_chatter_assignments
  ADD COLUMN IF NOT EXISTS team_name TEXT,
  ADD COLUMN IF NOT EXISTS assignment_group TEXT;

-- ── 10. Update model RLS for new roles ───────────────────────

DROP POLICY IF EXISTS "models_admin_select" ON public.models;
CREATE POLICY "models_management_select" ON public.models
  FOR SELECT USING (public.is_management());

DROP POLICY IF EXISTS "model_metrics_admin_select" ON public.model_metrics;
CREATE POLICY "model_metrics_management_select" ON public.model_metrics
  FOR SELECT USING (public.is_management());

DROP POLICY IF EXISTS "model_metrics_admin_write" ON public.model_metrics;
CREATE POLICY "model_metrics_upload_write" ON public.model_metrics
  FOR INSERT WITH CHECK (public.can_upload());

DROP POLICY IF EXISTS "model_metrics_admin_update" ON public.model_metrics;
CREATE POLICY "model_metrics_management_update" ON public.model_metrics
  FOR UPDATE USING (public.is_management());

DROP POLICY IF EXISTS "model_metrics_admin_delete" ON public.model_metrics;
CREATE POLICY "model_metrics_management_delete" ON public.model_metrics
  FOR DELETE USING (public.is_admin());

-- ── 11. Update chatters RLS ──────────────────────────────────

DROP POLICY IF EXISTS "chatters_admin_select" ON public.chatters;
CREATE POLICY "chatters_management_select" ON public.chatters
  FOR SELECT USING (public.is_management());

-- ── 12. Update schedules RLS ─────────────────────────────────

DROP POLICY IF EXISTS "schedules_admin_all" ON public.schedules;
CREATE POLICY "schedules_management_all" ON public.schedules
  FOR ALL USING (public.is_management());

-- ── 13. Update assignments RLS ───────────────────────────────

DROP POLICY IF EXISTS "assignments_admin_all" ON public.model_chatter_assignments;
CREATE POLICY "assignments_management_all" ON public.model_chatter_assignments
  FOR ALL USING (public.is_management());

-- ── 14. Update hours RLS ─────────────────────────────────────

DROP POLICY IF EXISTS "hours_admin_select" ON public.chatter_hours;
CREATE POLICY "hours_management_select" ON public.chatter_hours
  FOR SELECT USING (public.is_management());

-- ── 15. Update csv_uploads RLS ───────────────────────────────

DROP POLICY IF EXISTS "csv_uploads_admin_all" ON public.csv_uploads;
CREATE POLICY "csv_uploads_upload_all" ON public.csv_uploads
  FOR ALL USING (public.can_upload());

-- Update upload_type constraint for new types
ALTER TABLE public.csv_uploads DROP CONSTRAINT IF EXISTS csv_uploads_upload_type_check;
ALTER TABLE public.csv_uploads
  ADD CONSTRAINT csv_uploads_upload_type_check
  CHECK (upload_type IN ('model_metrics', 'chatter_hours', 'creator_report', 'employee_report'));

-- ── 16. Coaching tables (if not already created) ─────────────

CREATE TABLE IF NOT EXISTS public.coaching_tasks (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  chatter_name TEXT NOT NULL,
  team_tl TEXT NOT NULL,
  priority INT DEFAULT 0,
  perf_score NUMERIC(5,2),
  days_since_coaching INT DEFAULT 0,
  red_flags JSONB DEFAULT '[]',
  talking_points JSONB DEFAULT '[]',
  kpis JSONB DEFAULT '{}',
  perf_source TEXT,
  active_goal JSONB,
  goal_progress JSONB,
  prev_score NUMERIC(5,2),
  trend_arrow TEXT DEFAULT '→',
  trend_delta NUMERIC(5,2) DEFAULT 0,
  recent_reports JSONB DEFAULT '[]',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'skipped')),
  completed_at TIMESTAMPTZ,
  completed_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.coaching_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coaching_tasks_management_all" ON public.coaching_tasks
  FOR ALL USING (public.is_management());

CREATE INDEX IF NOT EXISTS idx_coaching_tasks_date ON public.coaching_tasks(date DESC);
CREATE INDEX IF NOT EXISTS idx_coaching_tasks_tl ON public.coaching_tasks(team_tl);

CREATE TABLE IF NOT EXISTS public.coaching_logs (
  id SERIAL PRIMARY KEY,
  task_id INT REFERENCES public.coaching_tasks(id),
  date DATE NOT NULL,
  chatter_name TEXT NOT NULL,
  team_tl TEXT NOT NULL,
  completed_by TEXT,
  focus_kpi TEXT,
  target_value NUMERIC(10,2),
  baseline_value NUMERIC(10,2),
  notes TEXT,
  perf_score NUMERIC(5,2),
  kpis JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.coaching_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coaching_logs_management_all" ON public.coaching_logs
  FOR ALL USING (public.is_management());

CREATE INDEX IF NOT EXISTS idx_coaching_logs_date ON public.coaching_logs(date DESC);

-- ── 17. Model daily stats (if not already created) ───────────

CREATE TABLE IF NOT EXISTS public.model_daily_stats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  model_id UUID REFERENCES public.models(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  new_fans INT DEFAULT 0,
  active_fans INT DEFAULT 0,
  fans_renew_on INT DEFAULT 0,
  renew_pct NUMERIC(5,2) DEFAULT 0,
  expired_change INT DEFAULT 0,
  total_earnings NUMERIC(12,2) DEFAULT 0,
  message_earnings NUMERIC(12,2) DEFAULT 0,
  subscription_earnings NUMERIC(12,2) DEFAULT 0,
  tips_earnings NUMERIC(12,2) DEFAULT 0,
  avg_spend_per_spender NUMERIC(10,2) DEFAULT 0,
  avg_sub_length_days NUMERIC(8,2) DEFAULT 0,
  of_ranking TEXT,
  following INT DEFAULT 0,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(model_id, date)
);

ALTER TABLE public.model_daily_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "model_daily_stats_management_select" ON public.model_daily_stats
  FOR SELECT USING (public.is_management());
CREATE POLICY "model_daily_stats_upload_write" ON public.model_daily_stats
  FOR INSERT WITH CHECK (public.can_upload());
CREATE POLICY "model_daily_stats_service_write" ON public.model_daily_stats
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_model_daily_stats_model ON public.model_daily_stats(model_id, date DESC);

-- ── 18. Chatter daily stats (if not already created) ─────────

CREATE TABLE IF NOT EXISTS public.chatter_daily_stats (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  employee_name TEXT NOT NULL,
  team TEXT,
  creators TEXT,
  sales NUMERIC(12,2) DEFAULT 0,
  ppv_sales NUMERIC(12,2) DEFAULT 0,
  tips NUMERIC(12,2) DEFAULT 0,
  dm_sales NUMERIC(12,2) DEFAULT 0,
  mass_msg_sales NUMERIC(12,2) DEFAULT 0,
  of_mass_msg_sales NUMERIC(12,2) DEFAULT 0,
  messages_sent INT DEFAULT 0,
  ppvs_sent INT DEFAULT 0,
  ppvs_unlocked INT DEFAULT 0,
  character_count INT DEFAULT 0,
  golden_ratio NUMERIC(8,4) DEFAULT 0,
  unlock_rate NUMERIC(8,4) DEFAULT 0,
  fan_cvr NUMERIC(8,4) DEFAULT 0,
  fans_chatted INT DEFAULT 0,
  fans_who_spent INT DEFAULT 0,
  avg_earnings_per_spender NUMERIC(10,2) DEFAULT 0,
  response_time_scheduled TEXT,
  response_time_clocked TEXT,
  scheduled_hours NUMERIC(5,2) DEFAULT 0,
  clocked_hours NUMERIC(5,2) DEFAULT 0,
  sales_per_hour NUMERIC(10,2) DEFAULT 0,
  messages_per_hour NUMERIC(10,2) DEFAULT 0,
  fans_per_hour NUMERIC(10,2) DEFAULT 0,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, employee_name)
);

ALTER TABLE public.chatter_daily_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chatter_daily_stats_management_select" ON public.chatter_daily_stats
  FOR SELECT USING (public.is_management());
CREATE POLICY "chatter_daily_stats_upload_write" ON public.chatter_daily_stats
  FOR INSERT WITH CHECK (public.can_upload());
CREATE POLICY "chatter_daily_stats_service_write" ON public.chatter_daily_stats
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_chatter_daily_stats_date ON public.chatter_daily_stats(date DESC);
CREATE INDEX IF NOT EXISTS idx_chatter_daily_stats_name ON public.chatter_daily_stats(employee_name);

-- ============================================================
-- Done. Run this after migration_fixed.sql against Supabase.
-- ============================================================
