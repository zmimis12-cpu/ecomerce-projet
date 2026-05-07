-- ── Migration: scan_events table + partial return support ────────────────────

-- ── 1. scan_events (requested table, separate from scanner_logs) ──────────────
CREATE TABLE IF NOT EXISTS scan_events (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tracking_number  TEXT NOT NULL,
  order_id         UUID REFERENCES orders(id) ON DELETE SET NULL,
  scan_type        TEXT NOT NULL,   -- outgoing | return | duplicate | invalid | damaged | partial_return
  scan_status      TEXT NOT NULL,   -- success | error | duplicate | warning
  operator_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  stock_before     JSONB DEFAULT '{}'::jsonb,  -- { productId: qty }
  stock_after      JSONB DEFAULT '{}'::jsonb,
  payload          JSONB DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_se_tracking  ON scan_events(tracking_number);
CREATE INDEX IF NOT EXISTS idx_se_order     ON scan_events(order_id);
CREATE INDEX IF NOT EXISTS idx_se_type      ON scan_events(scan_type);
CREATE INDEX IF NOT EXISTS idx_se_created   ON scan_events(created_at DESC);

ALTER TABLE scan_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "se_auth" ON scan_events FOR ALL USING (auth.uid() IS NOT NULL);

-- ── 2. Add partial_quantity to scanner_logs if missing ────────────────────────
ALTER TABLE scanner_logs
  ADD COLUMN IF NOT EXISTS partial_quantities JSONB;  -- { productId: returnedQty }
