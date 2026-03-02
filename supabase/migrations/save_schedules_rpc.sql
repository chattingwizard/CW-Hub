-- Transactional save for schedules: delete + insert in one atomic operation.
-- Prevents data loss if the insert fails after delete.
CREATE OR REPLACE FUNCTION public.save_schedules(
  p_week_start DATE,
  p_rows JSONB
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.schedules WHERE week_start = p_week_start;

  IF jsonb_array_length(p_rows) > 0 THEN
    INSERT INTO public.schedules (chatter_id, week_start, day_of_week, shift, created_by)
    SELECT
      (elem->>'chatter_id')::UUID,
      (elem->>'week_start')::DATE,
      (elem->>'day_of_week')::INTEGER,
      elem->>'shift',
      (elem->>'created_by')::UUID
    FROM jsonb_array_elements(p_rows) AS elem;
  END IF;
END;
$$;
