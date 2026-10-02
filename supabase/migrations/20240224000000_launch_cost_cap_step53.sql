-- Lanceur : plafond de coût (Cost Cap) par résultat, calculé depuis le coût max par livraison voulu
ALTER TABLE campaign_launches
  ADD COLUMN IF NOT EXISTS cost_cap_usd NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS max_cost_per_delivered_mad NUMERIC(10,2);
