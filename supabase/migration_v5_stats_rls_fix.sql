-- ============================================================
-- Migration v5: Add UPDATE + DELETE policies for stats tables
-- Without these, upsert (re-upload) and delete fail silently
-- ============================================================

-- model_daily_stats: allow uploaders to UPDATE and DELETE
CREATE POLICY "model_daily_stats_upload_update" ON public.model_daily_stats
  FOR UPDATE USING (public.can_upload());

CREATE POLICY "model_daily_stats_upload_delete" ON public.model_daily_stats
  FOR DELETE USING (public.can_upload());

-- chatter_daily_stats: allow uploaders to UPDATE and DELETE
CREATE POLICY "chatter_daily_stats_upload_update" ON public.chatter_daily_stats
  FOR UPDATE USING (public.can_upload());

CREATE POLICY "chatter_daily_stats_upload_delete" ON public.chatter_daily_stats
  FOR DELETE USING (public.can_upload());
