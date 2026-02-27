-- ============================================================
-- Migration V6: Team Overrides
-- Persistent team assignments for chatters (manual or upload).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.chatter_team_overrides (
  employee_name TEXT PRIMARY KEY,       -- lowercase normalized
  display_name  TEXT NOT NULL,
  team          TEXT NOT NULL,
  source        TEXT NOT NULL DEFAULT 'manual',  -- 'manual' | 'upload'
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.chatter_team_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_overrides_read" ON public.chatter_team_overrides
  FOR SELECT USING (public.is_management());

CREATE POLICY "team_overrides_write" ON public.chatter_team_overrides
  FOR ALL USING (public.is_management());

CREATE POLICY "team_overrides_upload" ON public.chatter_team_overrides
  FOR ALL USING (public.can_upload());
