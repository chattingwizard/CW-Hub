-- Shift Reports System
-- Run this in Supabase SQL Editor

-- 1. shift_reports table
CREATE TABLE IF NOT EXISTS shift_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chatter_id text NOT NULL REFERENCES chatters(id),
  date date NOT NULL,
  team text NOT NULL,
  model_team int NOT NULL CHECK (model_team BETWEEN 1 AND 8),
  traffic_level text NOT NULL CHECK (traffic_level IN ('low', 'moderate', 'high')),
  has_incident boolean NOT NULL DEFAULT false,
  incident_notes text,
  has_cover boolean NOT NULL DEFAULT false,
  cover_notes text,
  notes text,
  submitted_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chatter_id, date)
);

-- 2. shift_report_alerts table (tracks admin resolutions)
CREATE TABLE IF NOT EXISTS shift_report_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chatter_id text NOT NULL REFERENCES chatters(id),
  chatter_name text NOT NULL,
  date date NOT NULL,
  shift text NOT NULL,
  action text NOT NULL CHECK (action IN ('accepted', 'dismissed')),
  resolved_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chatter_id, date)
);

-- 3. RLS Policies
ALTER TABLE shift_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_report_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read shift_reports"
  ON shift_reports FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert shift_reports"
  ON shift_reports FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update shift_reports"
  ON shift_reports FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read shift_report_alerts"
  ON shift_report_alerts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert shift_report_alerts"
  ON shift_report_alerts FOR INSERT TO authenticated WITH CHECK (true);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_shift_reports_date ON shift_reports(date);
CREATE INDEX IF NOT EXISTS idx_shift_reports_chatter ON shift_reports(chatter_id);
CREATE INDEX IF NOT EXISTS idx_shift_report_alerts_date ON shift_report_alerts(date);
