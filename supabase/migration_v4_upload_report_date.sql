-- ============================================================
-- Migration v4: Add report_date to csv_uploads + backfill
-- ============================================================

-- 1. Add column
ALTER TABLE public.csv_uploads
  ADD COLUMN IF NOT EXISTS report_date DATE;

-- 2. Backfill creator_report uploads
--    Match each upload to the date in model_daily_stats where:
--    - row count matches the upload's row_count
--    - date is closest (in time) to the upload timestamp
UPDATE csv_uploads cu
SET report_date = best.d
FROM (
  SELECT cu2.id, lat.d
  FROM csv_uploads cu2
  CROSS JOIN LATERAL (
    SELECT grp.d
    FROM (
      SELECT date AS d, COUNT(*) AS cnt
      FROM model_daily_stats
      GROUP BY date
    ) grp
    WHERE grp.cnt = cu2.row_count
    ORDER BY ABS(EXTRACT(EPOCH FROM (cu2.uploaded_at - (grp.d + INTERVAL '12 hours'))))
    LIMIT 1
  ) lat
  WHERE cu2.upload_type = 'creator_report'
    AND cu2.report_date IS NULL
) best
WHERE cu.id = best.id;

-- 3. Backfill employee_report uploads (same logic with chatter_daily_stats)
UPDATE csv_uploads cu
SET report_date = best.d
FROM (
  SELECT cu2.id, lat.d
  FROM csv_uploads cu2
  CROSS JOIN LATERAL (
    SELECT grp.d
    FROM (
      SELECT date AS d, COUNT(*) AS cnt
      FROM chatter_daily_stats
      GROUP BY date
    ) grp
    WHERE grp.cnt = cu2.row_count
    ORDER BY ABS(EXTRACT(EPOCH FROM (cu2.uploaded_at - (grp.d + INTERVAL '12 hours'))))
    LIMIT 1
  ) lat
  WHERE cu2.upload_type = 'employee_report'
    AND cu2.report_date IS NULL
) best
WHERE cu.id = best.id;

-- 4. Fallback: for any remaining NULLs, try extracting from filename (DDMMYY pattern)
UPDATE csv_uploads
SET report_date = TO_DATE(
  SUBSTRING(REGEXP_REPLACE(file_name, '[^0-9]', '', 'g') FROM 1 FOR 6),
  'DDMMYY'
)
WHERE report_date IS NULL
  AND LENGTH(REGEXP_REPLACE(file_name, '[^0-9]', '', 'g')) >= 6;
