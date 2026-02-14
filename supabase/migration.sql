-- ============================================================
-- CW Hub — Supabase Migration
-- ============================================================
-- Run this in Supabase SQL Editor AFTER the CW-ChattingSchool migration.
-- This extends the existing schema with Hub-specific tables and policies.
-- ============================================================

-- ============================================================
-- 1. UPDATE PROFILES — Extend roles
-- ============================================================

-- Drop old constraint and add new one with 4 roles
ALTER TABLE public.profiles 
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles 
  ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('owner', 'admin', 'chatter', 'recruit'));

-- Migrate existing 'student' roles to 'recruit'
UPDATE public.profiles SET role = 'recruit' WHERE role = 'student';

-- Add new columns for Hub
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS airtable_chatter_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS team_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- ============================================================
-- 2. UPDATE FUNCTIONS — Support new roles
-- ============================================================

-- is_admin() now returns TRUE for both admin and owner
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role IN ('admin', 'owner')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- is_owner() for owner-only operations
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'owner'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Get current user's chatter record ID
CREATE OR REPLACE FUNCTION public.get_my_chatter_id()
RETURNS UUID AS $$
DECLARE
  chatter_uuid UUID;
BEGIN
  SELECT c.id INTO chatter_uuid
  FROM public.chatters c
  JOIN public.profiles p ON p.airtable_chatter_id = c.airtable_id
  WHERE p.id = auth.uid();
  RETURN chatter_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Get current user's team name
CREATE OR REPLACE FUNCTION public.get_my_team()
RETURNS TEXT AS $$
DECLARE
  team TEXT;
BEGIN
  SELECT p.team_name INTO team
  FROM public.profiles p
  WHERE p.id = auth.uid();
  RETURN team;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Update handle_new_user to default to 'recruit'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'recruit'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 3. NEW TABLE: models (synced from Airtable)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.models (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  airtable_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'Live',
  page_type TEXT,
  profile_picture_url TEXT,
  niche TEXT[] DEFAULT '{}',
  traffic_sources TEXT[] DEFAULT '{}',
  client_name TEXT,
  team_names TEXT[] DEFAULT '{}',
  chatbot_active BOOLEAN DEFAULT FALSE,
  scripts_url TEXT,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.models ENABLE ROW LEVEL SECURITY;

-- Admin/Owner: full read
CREATE POLICY "models_admin_select" ON public.models
  FOR SELECT USING (public.is_admin());

-- Chatters: see models from their team
CREATE POLICY "models_chatter_select" ON public.models
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() 
        AND p.role = 'chatter'
        AND p.team_name = ANY(models.team_names)
    )
  );

-- Service role can insert/update (for sync scripts)
CREATE POLICY "models_service_write" ON public.models
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- 4. NEW TABLE: model_metrics (CSV upload + sync)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.model_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  model_id UUID REFERENCES public.models(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  total_revenue NUMERIC(12,2) DEFAULT 0,
  new_subs INT DEFAULT 0,
  messages_revenue NUMERIC(12,2) DEFAULT 0,
  tips NUMERIC(12,2) DEFAULT 0,
  refunds NUMERIC(12,2) DEFAULT 0,
  warnings TEXT,
  observations TEXT,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(model_id, week_start)
);

ALTER TABLE public.model_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "model_metrics_admin_select" ON public.model_metrics
  FOR SELECT USING (public.is_admin());

CREATE POLICY "model_metrics_admin_write" ON public.model_metrics
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "model_metrics_admin_update" ON public.model_metrics
  FOR UPDATE USING (public.is_admin());

CREATE POLICY "model_metrics_admin_delete" ON public.model_metrics
  FOR DELETE USING (public.is_admin());

CREATE POLICY "model_metrics_service_write" ON public.model_metrics
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- 5. NEW TABLE: chatters (synced from Airtable)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.chatters (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  airtable_id TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  status TEXT DEFAULT 'Active',
  airtable_role TEXT,
  team_name TEXT,
  favorite_shift TEXT,
  profile_id UUID REFERENCES public.profiles(id),
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.chatters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chatters_admin_select" ON public.chatters
  FOR SELECT USING (public.is_admin());

CREATE POLICY "chatters_own_select" ON public.chatters
  FOR SELECT USING (
    profile_id = auth.uid()
  );

CREATE POLICY "chatters_team_select" ON public.chatters
  FOR SELECT USING (
    team_name = public.get_my_team()
    AND public.get_my_team() IS NOT NULL
  );

CREATE POLICY "chatters_service_write" ON public.chatters
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- 6. NEW TABLE: schedules
-- ============================================================

CREATE TABLE IF NOT EXISTS public.schedules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chatter_id UUID REFERENCES public.chatters(id) ON DELETE CASCADE NOT NULL,
  week_start DATE NOT NULL,
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  shift TEXT NOT NULL CHECK (shift IN ('00:00-08:00', '08:00-16:00', '16:00-00:00')),
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(chatter_id, week_start, day_of_week)
);

ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schedules_admin_all" ON public.schedules
  FOR ALL USING (public.is_admin());

CREATE POLICY "schedules_chatter_select" ON public.schedules
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chatters c
      WHERE c.id = schedules.chatter_id AND c.profile_id = auth.uid()
    )
  );

-- ============================================================
-- 7. NEW TABLE: model_chatter_assignments
-- ============================================================

CREATE TABLE IF NOT EXISTS public.model_chatter_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  model_id UUID REFERENCES public.models(id) ON DELETE CASCADE NOT NULL,
  chatter_id UUID REFERENCES public.chatters(id) ON DELETE CASCADE NOT NULL,
  assigned_by UUID REFERENCES public.profiles(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  active BOOLEAN DEFAULT TRUE,
  UNIQUE(model_id, chatter_id)
);

ALTER TABLE public.model_chatter_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assignments_admin_all" ON public.model_chatter_assignments
  FOR ALL USING (public.is_admin());

CREATE POLICY "assignments_chatter_select" ON public.model_chatter_assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chatters c
      WHERE c.id = model_chatter_assignments.chatter_id 
        AND c.profile_id = auth.uid()
    )
  );

-- ============================================================
-- 8. NEW TABLE: chatter_hours (synced from Hubstaff/Airtable)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.chatter_hours (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chatter_id UUID REFERENCES public.chatters(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  hours_worked NUMERIC(5,2) DEFAULT 0,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(chatter_id, date)
);

ALTER TABLE public.chatter_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hours_admin_select" ON public.chatter_hours
  FOR SELECT USING (public.is_admin());

CREATE POLICY "hours_chatter_own" ON public.chatter_hours
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chatters c
      WHERE c.id = chatter_hours.chatter_id AND c.profile_id = auth.uid()
    )
  );

CREATE POLICY "hours_service_write" ON public.chatter_hours
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- 9. NEW TABLE: csv_uploads (audit log)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.csv_uploads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  uploaded_by UUID REFERENCES public.profiles(id) NOT NULL,
  file_name TEXT NOT NULL,
  row_count INT NOT NULL,
  upload_type TEXT NOT NULL CHECK (upload_type IN ('model_metrics', 'chatter_hours')),
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.csv_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "csv_uploads_admin_all" ON public.csv_uploads
  FOR ALL USING (public.is_admin());

-- ============================================================
-- 10. ADMIN RPCs — Extended for Hub
-- ============================================================

-- Update user role (owner only for admin promotions)
CREATE OR REPLACE FUNCTION public.hub_set_user_role(target_id UUID, new_role TEXT)
RETURNS VOID AS $$
BEGIN
  -- Only owner can set admin/owner roles
  IF new_role IN ('admin', 'owner') AND NOT public.is_owner() THEN
    RAISE EXCEPTION 'Only owner can assign admin/owner roles';
  END IF;

  -- Admins can promote recruit → chatter
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin or owner required';
  END IF;

  UPDATE public.profiles SET role = new_role WHERE id = target_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get all hub users (admin/owner)
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
    SELECT 
      p.id, p.email, p.full_name, p.role, p.team_name,
      p.is_active, p.airtable_chatter_id, p.created_at
    FROM public.profiles p
    ORDER BY 
      CASE p.role 
        WHEN 'owner' THEN 1 
        WHEN 'admin' THEN 2 
        WHEN 'chatter' THEN 3 
        WHEN 'recruit' THEN 4 
      END,
      p.full_name
  ) t;

  RETURN COALESCE(result, '[]'::JSON);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 11. INDEXES for performance
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_chatters_team ON public.chatters(team_name);
CREATE INDEX IF NOT EXISTS idx_chatters_status ON public.chatters(status);
CREATE INDEX IF NOT EXISTS idx_chatters_profile ON public.chatters(profile_id);
CREATE INDEX IF NOT EXISTS idx_schedules_week ON public.schedules(week_start);
CREATE INDEX IF NOT EXISTS idx_schedules_chatter ON public.schedules(chatter_id);
CREATE INDEX IF NOT EXISTS idx_model_metrics_model ON public.model_metrics(model_id);
CREATE INDEX IF NOT EXISTS idx_model_metrics_week ON public.model_metrics(week_start);
CREATE INDEX IF NOT EXISTS idx_assignments_model ON public.model_chatter_assignments(model_id);
CREATE INDEX IF NOT EXISTS idx_assignments_chatter ON public.model_chatter_assignments(chatter_id);
CREATE INDEX IF NOT EXISTS idx_chatter_hours_date ON public.chatter_hours(date);
CREATE INDEX IF NOT EXISTS idx_chatter_hours_chatter ON public.chatter_hours(chatter_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- ============================================================
-- DONE. After running:
-- 1. Set Pau's account to 'owner': 
--    UPDATE public.profiles SET role = 'owner' WHERE email = 'pau@chattingwizard.com';
-- 2. Verify with: SELECT * FROM public.profiles;
-- ============================================================
