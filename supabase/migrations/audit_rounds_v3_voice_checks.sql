-- Audit Rounds v3: Voice Checks
-- Each round, TL voice-calls 1-2 random chatters to confirm presence.
-- Stores array of {chatter_name, responded} objects.

ALTER TABLE audit_rounds ADD COLUMN IF NOT EXISTS voice_checks JSONB DEFAULT '[]';
