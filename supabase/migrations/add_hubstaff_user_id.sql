-- Add hubstaff_user_id to chatters table for reliable ID-based matching
-- instead of error-prone name matching between Hubstaff and Supabase.
ALTER TABLE public.chatters ADD COLUMN IF NOT EXISTS hubstaff_user_id INTEGER UNIQUE;
CREATE INDEX IF NOT EXISTS idx_chatters_hubstaff_user_id ON public.chatters(hubstaff_user_id);
