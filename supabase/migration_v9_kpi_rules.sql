ALTER TABLE score_config ADD COLUMN IF NOT EXISTS kpi_rules jsonb DEFAULT '{
  "golden_ratio": { "t1": { "threshold": 5, "pts": 20 }, "t2": { "threshold": 4, "pts": 10 }, "t3": { "threshold": 3, "pts": 0 }, "below_pts": -20 },
  "fan_cvr":      { "t1": { "threshold": 10, "pts": 20 }, "t2": { "threshold": 8, "pts": 10 }, "t3": { "threshold": 6, "pts": 0 }, "below_pts": -15 },
  "unlock_rate":  { "t1": { "threshold": 45, "pts": 20 }, "t2": { "threshold": 40, "pts": 10 }, "t3": { "threshold": 35, "pts": 0 }, "below_pts": -15 },
  "reply_time":   { "t1": { "threshold": 60, "pts": 20 }, "t2": { "threshold": 120, "pts": 10 }, "t3": { "threshold": 180, "pts": 0 }, "below_pts": -20 }
}'::jsonb;
