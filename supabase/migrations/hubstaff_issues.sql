-- Hubstaff Issues Reporting System
-- Run this in Supabase SQL Editor

-- 1. hubstaff_issues table
CREATE TABLE IF NOT EXISTS hubstaff_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_type text NOT NULL CHECK (issue_type IN (
    'not_tracking', 'app_not_working'
  )),
  description text NOT NULL,
  incident_date date NOT NULL,
  time_start time NOT NULL,
  time_end time NOT NULL,
  team text NOT NULL,
  screenshot_urls text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolution_notes text,
  submitted_by uuid NOT NULL REFERENCES profiles(id),
  resolved_by uuid REFERENCES profiles(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. RLS Policies
ALTER TABLE hubstaff_issues ENABLE ROW LEVEL SECURITY;

-- Chatters see own rows; owner/admin see all
CREATE POLICY "Users can read own issues or admins read all"
  ON hubstaff_issues FOR SELECT TO authenticated
  USING (
    submitted_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('owner', 'admin')
    )
  );

-- Any authenticated user can submit
CREATE POLICY "Authenticated users can insert hubstaff_issues"
  ON hubstaff_issues FOR INSERT TO authenticated
  WITH CHECK (submitted_by = auth.uid());

-- Only owner/admin can update (resolve)
CREATE POLICY "Only owner/admin can update hubstaff_issues"
  ON hubstaff_issues FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('owner', 'admin')
    )
  );

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_hubstaff_issues_submitted_by ON hubstaff_issues(submitted_by);
CREATE INDEX IF NOT EXISTS idx_hubstaff_issues_status ON hubstaff_issues(status);
CREATE INDEX IF NOT EXISTS idx_hubstaff_issues_created_at ON hubstaff_issues(created_at DESC);

-- 4. Storage bucket for screenshots
INSERT INTO storage.buckets (id, name, public)
VALUES ('hubstaff-screenshots', 'hubstaff-screenshots', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload hubstaff screenshots"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'hubstaff-screenshots');

CREATE POLICY "Public read for hubstaff screenshots"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'hubstaff-screenshots');
