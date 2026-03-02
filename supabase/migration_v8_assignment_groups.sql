-- Migration V8: Assignment Groups ("Equipos")
-- Replaces model-by-model assignments with group-based system

-- ── 1. Assignment Groups ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assignment_groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  active BOOLEAN DEFAULT TRUE
);

ALTER TABLE public.assignment_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "groups_management_all" ON public.assignment_groups
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('owner', 'admin', 'chatter_manager', 'team_leader')
    )
  );

CREATE POLICY "groups_chatter_select" ON public.assignment_groups
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'chatter'
    )
  );

-- ── 2. Models in Groups ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assignment_group_models (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID REFERENCES public.assignment_groups(id) ON DELETE CASCADE NOT NULL,
  model_id UUID REFERENCES public.models(id) ON DELETE CASCADE NOT NULL,
  assigned_by UUID REFERENCES public.profiles(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(model_id)  -- each model belongs to exactly one group
);

ALTER TABLE public.assignment_group_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "group_models_management_all" ON public.assignment_group_models
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('owner', 'admin', 'chatter_manager', 'team_leader')
    )
  );

CREATE POLICY "group_models_chatter_select" ON public.assignment_group_models
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'chatter'
    )
  );

-- ── 3. Default Chatters in Groups ────────────────────────────
CREATE TABLE IF NOT EXISTS public.assignment_group_chatters (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID REFERENCES public.assignment_groups(id) ON DELETE CASCADE NOT NULL,
  chatter_id UUID REFERENCES public.chatters(id) ON DELETE CASCADE NOT NULL,
  assigned_by UUID REFERENCES public.profiles(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(chatter_id)  -- each chatter has exactly one default group
);

ALTER TABLE public.assignment_group_chatters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "group_chatters_management_all" ON public.assignment_group_chatters
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('owner', 'admin', 'chatter_manager', 'team_leader')
    )
  );

CREATE POLICY "group_chatters_chatter_select" ON public.assignment_group_chatters
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'chatter'
    )
  );

-- ── 4. Per-date Overrides (coverage) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.assignment_group_overrides (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID REFERENCES public.assignment_groups(id) ON DELETE CASCADE NOT NULL,
  chatter_id UUID REFERENCES public.chatters(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  assigned_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(chatter_id, date)  -- one override per chatter per day
);

ALTER TABLE public.assignment_group_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "group_overrides_management_all" ON public.assignment_group_overrides
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('owner', 'admin', 'chatter_manager', 'team_leader')
    )
  );

CREATE POLICY "group_overrides_chatter_select" ON public.assignment_group_overrides
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'chatter'
    )
  );

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_group_models_group ON public.assignment_group_models(group_id);
CREATE INDEX IF NOT EXISTS idx_group_models_model ON public.assignment_group_models(model_id);
CREATE INDEX IF NOT EXISTS idx_group_chatters_group ON public.assignment_group_chatters(group_id);
CREATE INDEX IF NOT EXISTS idx_group_chatters_chatter ON public.assignment_group_chatters(chatter_id);
CREATE INDEX IF NOT EXISTS idx_group_overrides_group ON public.assignment_group_overrides(group_id);
CREATE INDEX IF NOT EXISTS idx_group_overrides_date ON public.assignment_group_overrides(date);
