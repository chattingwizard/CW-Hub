-- TL Audit Rounds System
-- Run this in Supabase SQL Editor

-- 1. audit_rounds table
CREATE TABLE IF NOT EXISTS audit_rounds (
  id SERIAL PRIMARY KEY,
  tl_user_id UUID NOT NULL REFERENCES profiles(id),
  tl_name TEXT NOT NULL,
  shift_date DATE NOT NULL,
  round_number INT NOT NULL CHECK (round_number BETWEEN 1 AND 7),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  chatters_reviewed INT NOT NULL DEFAULT 0,
  issues_found INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tl_name, shift_date, round_number)
);

-- 2. audit_flags table
CREATE TABLE IF NOT EXISTS audit_flags (
  id SERIAL PRIMARY KEY,
  round_id INT NOT NULL REFERENCES audit_rounds(id) ON DELETE CASCADE,
  chatter_name TEXT NOT NULL,
  model_account TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. RLS Policies
ALTER TABLE audit_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_rounds_management_all" ON audit_rounds
  FOR ALL USING (public.is_management());

CREATE POLICY "audit_flags_management_all" ON audit_flags
  FOR ALL USING (public.is_management());

CREATE POLICY "audit_rounds_service" ON audit_rounds
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "audit_flags_service" ON audit_flags
  FOR ALL USING (auth.role() = 'service_role');

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_audit_rounds_date ON audit_rounds(shift_date DESC);
CREATE INDEX IF NOT EXISTS idx_audit_rounds_tl ON audit_rounds(tl_name, shift_date);
CREATE INDEX IF NOT EXISTS idx_audit_flags_round ON audit_flags(round_id);
CREATE INDEX IF NOT EXISTS idx_audit_flags_chatter ON audit_flags(chatter_name);
