-- Migration V12: Assignment Presets
-- Save/load named snapshots of model-to-group assignments

CREATE TABLE IF NOT EXISTS public.assignment_presets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.assignment_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "presets_management_all" ON public.assignment_presets
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('owner', 'admin', 'chatter_manager', 'team_leader')
    )
  );

CREATE POLICY "presets_chatter_select" ON public.assignment_presets
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'chatter'
    )
  );

CREATE INDEX IF NOT EXISTS idx_assignment_presets_created_by ON public.assignment_presets(created_by);
