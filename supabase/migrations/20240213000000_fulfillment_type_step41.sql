-- ── Migration: type de livraison (Digylog vs livreur propre) ────────────────
-- Sans ça, "Net Collecté" déduisait toujours un frais Digylog (20/35 MAD),
-- même pour les commandes livrées par un livreur propre où il n'y a AUCUN
-- frais de transporteur tiers à déduire (livraison gratuite annoncée).
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS fulfillment_type TEXT NOT NULL DEFAULT 'digylog';
