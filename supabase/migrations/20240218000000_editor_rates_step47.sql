-- ── Tarifs éditeurs flexibles + gain figé au moment de la livraison ──────────
-- Priorité : (éditeur + produit) > (produit, tous éditeurs) > tarif par défaut de l'éditeur
CREATE TABLE IF NOT EXISTS video_editor_rates (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  editor_id        UUID REFERENCES users(id) ON DELETE CASCADE,     -- NULL = tous les éditeurs
  product_id       UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  commission_type  TEXT NOT NULL CHECK (commission_type IN ('fixed','percent')),
  commission_value NUMERIC(10,2) NOT NULL CHECK (commission_value >= 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_editor_rates
  ON video_editor_rates (COALESCE(editor_id, '00000000-0000-0000-0000-000000000000'::uuid), product_id);
ALTER TABLE video_editor_rates ENABLE ROW LEVEL SECURITY;

-- Gain de l'éditeur FIGÉ à la livraison : changer un tarif plus tard ne
-- modifie pas ce qui a déjà été gagné.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS editor_earning_mad NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS editor_rate_label  TEXT;
