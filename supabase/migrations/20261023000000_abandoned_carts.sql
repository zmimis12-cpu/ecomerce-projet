-- Paniers abandonnés : client qui a tapé son téléphone dans le formulaire de la landing page
-- sans envoyer la commande → le call center le rappelle.
CREATE TABLE IF NOT EXISTS abandoned_carts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  product_id        UUID REFERENCES products(id) ON DELETE SET NULL,
  landing_page_slug TEXT,
  customer_name     TEXT,
  customer_phone    TEXT NOT NULL,
  customer_city     TEXT,
  total_amount      NUMERIC(10,2),
  quantity          INT,
  creative_code     TEXT,
  status            TEXT NOT NULL DEFAULT 'pending',   -- pending | called | converted | not_interested
  order_id          UUID REFERENCES orders(id) ON DELETE SET NULL,
  handled_by        UUID,
  handled_at        TIMESTAMPTZ,
  payload           JSONB,                              -- données du formulaire (pour créer la commande en 1 clic)
  ip_hash           TEXT
);
CREATE INDEX IF NOT EXISTS idx_abandoned_status_created ON abandoned_carts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_abandoned_phone_product ON abandoned_carts(customer_phone, product_id);
CREATE INDEX IF NOT EXISTS idx_abandoned_ip ON abandoned_carts(ip_hash, created_at DESC);
ALTER TABLE abandoned_carts ENABLE ROW LEVEL SECURITY;  -- accès uniquement via le serveur (service role)
