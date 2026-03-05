-- ============================================================
-- Model Info Redesign — Migration
-- ============================================================
-- Adds: details JSONB on models, model_changes table, model_profile_views table
-- ============================================================

-- 1. Add details JSONB column to models
ALTER TABLE public.models ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}';

-- 2. model_changes — tracks field-level changes detected during sync
CREATE TABLE IF NOT EXISTS public.model_changes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  model_id UUID REFERENCES public.models(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_model_changes_model
  ON public.model_changes(model_id, changed_at DESC);

ALTER TABLE public.model_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "model_changes_admin_select" ON public.model_changes
  FOR SELECT USING (public.is_admin());

CREATE POLICY "model_changes_chatter_select" ON public.model_changes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('chatter', 'chatter_manager', 'team_leader', 'script_manager')
    )
  );

CREATE POLICY "model_changes_service_write" ON public.model_changes
  FOR ALL USING (auth.role() = 'service_role');

-- 3. model_profile_views — tracks per-user last visit per model
CREATE TABLE IF NOT EXISTS public.model_profile_views (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  model_id UUID REFERENCES public.models(id) ON DELETE CASCADE,
  last_viewed_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, model_id)
);

ALTER TABLE public.model_profile_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "model_profile_views_own" ON public.model_profile_views
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "model_profile_views_service" ON public.model_profile_views
  FOR ALL USING (auth.role() = 'service_role');
