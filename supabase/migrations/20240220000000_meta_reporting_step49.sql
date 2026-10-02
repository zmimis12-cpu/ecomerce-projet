-- ── Reporting automatique des livraisons à Meta + audience "Acheteurs" ───────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS meta_purchase_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS meta_purchase_error   TEXT,
  ADD COLUMN IF NOT EXISTS meta_audience_added   BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_orders_meta_pending
  ON orders (status) WHERE meta_purchase_sent = FALSE;
