-- ============================================================
-- Migration V11: Hub Team Ownership
-- Makes Hub the source of truth for chatter team assignments.
-- Airtable sync only sets team_name on initial insert.
-- ============================================================

-- Ensure chatter_team_overrides exists (from v6, may not be applied)
CREATE TABLE IF NOT EXISTS public.chatter_team_overrides (
  employee_name TEXT PRIMARY KEY,
  display_name  TEXT NOT NULL,
  team          TEXT NOT NULL,
  source        TEXT NOT NULL DEFAULT 'manual',
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.chatter_team_overrides ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'chatter_team_overrides' AND policyname = 'team_overrides_read') THEN
    CREATE POLICY "team_overrides_read" ON public.chatter_team_overrides FOR SELECT USING (public.is_management());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'chatter_team_overrides' AND policyname = 'team_overrides_write') THEN
    CREATE POLICY "team_overrides_write" ON public.chatter_team_overrides FOR ALL USING (public.is_management());
  END IF;
END $$;

-- RPC to update a chatter's team assignment (only team_name, nothing else)
CREATE OR REPLACE FUNCTION public.update_chatter_team(
  p_chatter_id UUID,
  p_team_name TEXT
) RETURNS VOID AS $$
BEGIN
  IF NOT public.is_management() THEN
    RAISE EXCEPTION 'Access denied: management role required';
  END IF;

  UPDATE public.chatters
  SET team_name = p_team_name
  WHERE id = p_chatter_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
