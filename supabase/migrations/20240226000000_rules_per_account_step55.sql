-- Règles : limiter une règle à UN compte Meta (vide = tous les comptes) + compte dans le journal
ALTER TABLE ad_rules     ADD COLUMN IF NOT EXISTS account_key   TEXT;
ALTER TABLE ad_rule_logs ADD COLUMN IF NOT EXISTS account_label TEXT;
