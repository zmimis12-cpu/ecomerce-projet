-- ── Migration: Exchange orders (échanges Digylog) ───────────────────────────
-- Permet de lier une commande d'échange (nouveau tracking EC...) à la commande
-- d'origine, sans la compter comme un vrai retour.

-- 1. Nouveau statut 'exchanged' (distinct de 'returned')
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'exchanged';

-- 2. Colonnes de liaison sur orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS exchange_of_order_id UUID REFERENCES orders(id),
  ADD COLUMN IF NOT EXISTS is_exchange           BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_orders_exchange_of ON orders(exchange_of_order_id);

-- 3. Marquer les webhooks orphelins liés à un tracking d'échange (préfixe EC)
ALTER TABLE orphan_webhooks
  ADD COLUMN IF NOT EXISTS looks_like_exchange BOOLEAN NOT NULL DEFAULT false;

-- 4. Contrainte unique nécessaire pour l'upsert onConflict("tracking_number")
--    (dédupe les webhooks répétés sur le même tracking orphelin)

-- 4a. Nettoyer les doublons existants — on garde la ligne la plus récente par tracking
DELETE FROM orphan_webhooks a
USING orphan_webhooks b
WHERE a.tracking_number = b.tracking_number
  AND a.created_at < b.created_at;

-- 4b. Sécurité: s'il reste des doublons avec created_at identique, garder un seul via ctid
DELETE FROM orphan_webhooks a
USING orphan_webhooks b
WHERE a.tracking_number = b.tracking_number
  AND a.ctid < b.ctid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orphan_webhooks_tracking_unique'
  ) THEN
    ALTER TABLE orphan_webhooks
      ADD CONSTRAINT orphan_webhooks_tracking_unique UNIQUE (tracking_number);
  END IF;
END $$;