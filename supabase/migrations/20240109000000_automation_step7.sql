-- =============================================================================
-- MIGRATION: Automation + Google Sheets Sync — Step 7
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. order-level sync tracking fields
-- -----------------------------------------------------------------------------
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS last_sync_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_status    TEXT,          -- 'synced' | 'failed' | 'pending'
  ADD COLUMN IF NOT EXISTS sync_sheet_row INT;           -- row index written in the sheet

-- sync_error already added in step 4

-- -----------------------------------------------------------------------------
-- 2. google_sheet_sync_logs — per-order sync record
--    Separate from sync_logs (which is config-level batch tracking).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS google_sheet_sync_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sheet_type    TEXT NOT NULL,          -- 'confirmed' | 'delivered_paid' | 'returned'
  status        TEXT NOT NULL DEFAULT 'pending', -- 'success' | 'failed' | 'pending'
  error_message TEXT,
  sheet_row     INT,                    -- row written in sheet
  payload       JSONB,                  -- snapshot of what was sent
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gssl_order_id    ON google_sheet_sync_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_gssl_sheet_type  ON google_sheet_sync_logs(sheet_type);
CREATE INDEX IF NOT EXISTS idx_gssl_status      ON google_sheet_sync_logs(status);
CREATE INDEX IF NOT EXISTS idx_gssl_created     ON google_sheet_sync_logs(created_at DESC);

ALTER TABLE google_sheet_sync_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gssl_all_authenticated" ON google_sheet_sync_logs
  FOR ALL USING (auth.uid() IS NOT NULL);

-- -----------------------------------------------------------------------------
-- 3. webhook_logs — generic event log
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS webhook_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type    TEXT NOT NULL,         -- 'order.confirmed' | 'order.delivered' | 'order.returned'
  order_id      UUID REFERENCES orders(id) ON DELETE SET NULL,
  payload       JSONB NOT NULL DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'pending',  -- 'success' | 'failed' | 'pending'
  error         TEXT,
  duration_ms   INT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whl_event_type ON webhook_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_whl_order_id   ON webhook_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_whl_status     ON webhook_logs(status);
CREATE INDEX IF NOT EXISTS idx_whl_created    ON webhook_logs(created_at DESC);

ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "whl_all_authenticated" ON webhook_logs
  FOR ALL USING (auth.uid() IS NOT NULL);

-- -----------------------------------------------------------------------------
-- 4. Indexes on orders for sync queries
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_orders_sync_status  ON orders(sync_status);
CREATE INDEX IF NOT EXISTS idx_orders_last_sync_at ON orders(last_sync_at DESC);
