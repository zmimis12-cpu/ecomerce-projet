-- =============================================================================
-- MIGRATION: Digylog Settings + Extra columns — Step 14
-- =============================================================================

-- ── 1. digylog_settings ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS digylog_settings (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  token                    TEXT NOT NULL DEFAULT '',
  referer                  TEXT NOT NULL DEFAULT 'https://apiseller.digylog.com',
  default_network_id       INTEGER NOT NULL DEFAULT 1,
  default_store_name       TEXT NOT NULL DEFAULT '',
  default_mode             INTEGER NOT NULL DEFAULT 1,  -- 1=standard, 2=FC
  default_status_on_create INTEGER NOT NULL DEFAULT 1,  -- 0=add only, 1=add+send
  default_port             INTEGER NOT NULL DEFAULT 1,  -- 1=by customer, 2=by seller
  webhook_url              TEXT,
  webhook_secret           TEXT,
  config                   JSONB DEFAULT '{}'::jsonb,   -- cached networks/stores/cities
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE digylog_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ds_admin" ON digylog_settings FOR ALL USING (auth.uid() IS NOT NULL);

-- Seed default row
INSERT INTO digylog_settings (token, referer)
VALUES ('', 'https://apiseller.digylog.com')
ON CONFLICT DO NOTHING;

-- ── 2. Add missing columns to delivery_shipments ──────────────────────────────
ALTER TABLE delivery_shipments
  ADD COLUMN IF NOT EXISTS external_status_id  INTEGER,
  ADD COLUMN IF NOT EXISTS bl_id               INTEGER,
  ADD COLUMN IF NOT EXISTS motif               TEXT,
  ADD COLUMN IF NOT EXISTS postponed_to        DATE;

-- ── 3. Add missing columns to delivery_status_events ─────────────────────────
ALTER TABLE delivery_status_events
  ADD COLUMN IF NOT EXISTS external_status_id  INTEGER,
  ADD COLUMN IF NOT EXISTS motif               TEXT,
  ADD COLUMN IF NOT EXISTS postponed_to        DATE;

-- ── 4. Add missing columns to orders ─────────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_external_status_id INTEGER,
  ADD COLUMN IF NOT EXISTS bl_id                       INTEGER;

-- ── 5. Extra index on bl_id ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_bl_id ON orders(bl_id) WHERE bl_id IS NOT NULL;
