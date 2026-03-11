-- Audit Rounds v2: Situation Report & Screenshots
-- Run this in Supabase SQL Editor

ALTER TABLE audit_rounds ADD COLUMN IF NOT EXISTS traffic_level TEXT CHECK (traffic_level IN ('low', 'medium', 'high'));
ALTER TABLE audit_rounds ADD COLUMN IF NOT EXISTS has_unanswered BOOLEAN DEFAULT false;
ALTER TABLE audit_rounds ADD COLUMN IF NOT EXISTS unanswered_chatters TEXT;
ALTER TABLE audit_rounds ADD COLUMN IF NOT EXISTS unanswered_models TEXT;
ALTER TABLE audit_rounds ADD COLUMN IF NOT EXISTS has_backlog BOOLEAN DEFAULT false;
ALTER TABLE audit_rounds ADD COLUMN IF NOT EXISTS backlog_chatters TEXT;
ALTER TABLE audit_rounds ADD COLUMN IF NOT EXISTS backlog_models TEXT;
ALTER TABLE audit_rounds ADD COLUMN IF NOT EXISTS has_other_issues BOOLEAN DEFAULT false;
ALTER TABLE audit_rounds ADD COLUMN IF NOT EXISTS other_issues_notes TEXT;
ALTER TABLE audit_rounds ADD COLUMN IF NOT EXISTS screenshot_urls TEXT[] DEFAULT '{}';
