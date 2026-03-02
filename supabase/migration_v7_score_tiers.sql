-- Add Silver tier columns to score_config
ALTER TABLE score_config ADD COLUMN IF NOT EXISTS silver_threshold integer DEFAULT 110;
ALTER TABLE score_config ADD COLUMN IF NOT EXISTS silver_amount integer DEFAULT 5;

-- Update config to new tier thresholds
UPDATE score_config SET
  tier_20_threshold = 170,  -- Diamond
  tier_10_threshold = 150,  -- Platinum
  tier_5_threshold  = 130,  -- Gold
  warning_threshold = 75,   -- Bronze (below this)
  tier_20_amount = 20,      -- Diamond bonus
  tier_10_amount = 15,      -- Platinum bonus
  tier_5_amount  = 10,      -- Gold bonus
  silver_threshold = 110,   -- Silver
  silver_amount = 5         -- Silver bonus
WHERE id = 1;
