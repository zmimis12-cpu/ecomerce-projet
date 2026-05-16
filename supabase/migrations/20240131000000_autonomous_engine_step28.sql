-- ── Migration Step 28: Shipping fee rules + enhanced architecture ─────────────

-- Dynamic shipping fee rules per provider/city
CREATE TABLE IF NOT EXISTS shipping_fee_rules (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_slug   TEXT NOT NULL DEFAULT 'digylog',
  store_id        UUID REFERENCES delivery_stores(id) ON DELETE CASCADE,
  city_pattern    TEXT NOT NULL,        -- exact city name or pattern (ILIKE match)
  is_casablanca   BOOLEAN DEFAULT false, -- shortcut flag for Casa rule
  shipping_fee    NUMERIC(8,2) NOT NULL DEFAULT 35,
  return_fee      NUMERIC(8,2) DEFAULT 0,
  fulfillment_fee NUMERIC(8,2) DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  priority        INT DEFAULT 0,        -- higher = applied first
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider_slug, city_pattern, store_id)
);

-- Seed default rules
INSERT INTO shipping_fee_rules (provider_slug, city_pattern, is_casablanca, shipping_fee, return_fee, priority, notes)
VALUES
  ('digylog', 'Casablanca',   true,  25, 15, 100, 'Casablanca standard'),
  ('digylog', 'Casa',         true,  25, 15, 99,  'Casablanca abbreviated'),
  ('digylog', 'Derb Sultan',  true,  25, 15, 98,  'Casablanca district'),
  ('digylog', 'Ain Chock',    true,  25, 15, 97,  'Casablanca district'),
  ('digylog', 'Hay Hassani',  true,  25, 15, 96,  'Casablanca district'),
  ('digylog', 'Sidi Maarouf', true,  25, 15, 95,  'Casablanca district'),
  ('digylog', 'Ain Sebaa',    true,  25, 15, 94,  'Casablanca district'),
  ('digylog', '%',            false, 35, 20,   0, 'Default all cities')
ON CONFLICT (provider_slug, city_pattern, store_id) DO NOTHING;

-- Return verification events (scanner → reconciliation link)
CREATE TABLE IF NOT EXISTS return_verifications (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tracking_number   TEXT NOT NULL,
  order_id          UUID REFERENCES orders(id) ON DELETE SET NULL,
  provider_slug     TEXT NOT NULL DEFAULT 'digylog',
  store_name        TEXT,

  -- Provider claim
  provider_returned_at  TIMESTAMPTZ,
  provider_return_batch TEXT,           -- BR number from provider

  -- Warehouse verification
  scanned_at        TIMESTAMPTZ,
  scanned_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  condition         TEXT DEFAULT 'unknown',
  -- good | damaged | missing_quantity | wrong_product | unknown

  received_quantity INT,
  expected_quantity INT,

  -- Reconciliation
  reconciliation_status TEXT DEFAULT 'pending',
  -- pending | verified_ok | discrepancy | lost
  discrepancy_note  TEXT,
  refund_eligible   BOOLEAN DEFAULT false,
  refund_amount     NUMERIC(10,2),

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tracking_number, provider_slug)
);

CREATE INDEX IF NOT EXISTS idx_rv_tracking  ON return_verifications(tracking_number);
CREATE INDEX IF NOT EXISTS idx_rv_order     ON return_verifications(order_id);
CREATE INDEX IF NOT EXISTS idx_rv_status    ON return_verifications(reconciliation_status);

-- Enhanced provider sync logs (replaces old table)
ALTER TABLE provider_sync_logs
  ADD COLUMN IF NOT EXISTS store_id    UUID REFERENCES delivery_stores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS success_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_count   INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS raw_error     TEXT;

-- Payout records (from provider invoices/CSV)
CREATE TABLE IF NOT EXISTS provider_payouts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_slug   TEXT NOT NULL,
  store_id        UUID REFERENCES delivery_stores(id) ON DELETE SET NULL,
  store_name      TEXT,
  invoice_ref     TEXT,
  payment_date    DATE,
  tracking        TEXT,
  order_id        UUID REFERENCES orders(id) ON DELETE SET NULL,
  cod_collected   NUMERIC(10,2),
  shipping_fee    NUMERIC(10,2),
  return_fee      NUMERIC(10,2),
  net_payout      NUMERIC(10,2),
  status          TEXT DEFAULT 'pending', -- pending | paid | disputed
  source          TEXT DEFAULT 'manual',  -- manual | api | csv
  raw_line        JSONB,
  reconciled      BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pp_tracking  ON provider_payouts(tracking);
CREATE INDEX IF NOT EXISTS idx_pp_provider  ON provider_payouts(provider_slug);
CREATE INDEX IF NOT EXISTS idx_pp_date      ON provider_payouts(payment_date DESC);

ALTER TABLE return_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipping_fee_rules   ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_payouts     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rv_auth"  ON return_verifications FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "sfr_auth" ON shipping_fee_rules   FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "pp_auth"  ON provider_payouts     FOR ALL USING (auth.uid() IS NOT NULL);
