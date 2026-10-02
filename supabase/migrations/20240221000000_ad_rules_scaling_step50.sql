-- ── Règles de SCALING : augmenter / baisser le budget automatiquement ────────
ALTER TABLE ad_rules DROP CONSTRAINT IF EXISTS ad_rules_action_check;
ALTER TABLE ad_rules ADD CONSTRAINT ad_rules_action_check
  CHECK (action IN ('pause','activate','notify','increase_budget','decrease_budget'));
ALTER TABLE ad_rules
  ADD COLUMN IF NOT EXISTS budget_pct     NUMERIC(5,2),   -- ex : 20 = +20 % / -20 %
  ADD COLUMN IF NOT EXISTS budget_max_usd NUMERIC(10,2),  -- plafond quotidien (hausse)
  ADD COLUMN IF NOT EXISTS budget_min_usd NUMERIC(10,2);  -- plancher quotidien (baisse)
ALTER TABLE ad_rule_logs ADD COLUMN IF NOT EXISTS detail TEXT;
