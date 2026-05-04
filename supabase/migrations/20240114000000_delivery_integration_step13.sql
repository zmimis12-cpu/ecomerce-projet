-- =============================================================================
-- MIGRATION: Delivery Company API Integration — Step 13
-- =============================================================================

-- ── 1. delivery_companies ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_companies (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             TEXT NOT NULL,
  slug             TEXT UNIQUE NOT NULL,           -- e.g. 'digylog', 'amana'
  api_base_url     TEXT,
  api_key_encrypted TEXT,                          -- AES-256 encrypted server-side
  webhook_secret   TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  config           JSONB DEFAULT '{}'::jsonb,      -- provider-specific config
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE delivery_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dc_auth" ON delivery_companies FOR ALL USING (auth.uid() IS NOT NULL);

-- ── 2. delivery_shipments ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_shipments (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id            UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  delivery_company_id UUID REFERENCES delivery_companies(id),
  tracking_number     TEXT UNIQUE,
  external_order_id   TEXT,
  external_status     TEXT,
  internal_status     TEXT,
  last_synced_at      TIMESTAMPTZ,
  raw_payload         JSONB DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ds_order       ON delivery_shipments(order_id);
CREATE INDEX IF NOT EXISTS idx_ds_tracking    ON delivery_shipments(tracking_number);
CREATE INDEX IF NOT EXISTS idx_ds_external    ON delivery_shipments(external_order_id);
CREATE INDEX IF NOT EXISTS idx_ds_company     ON delivery_shipments(delivery_company_id);
ALTER TABLE delivery_shipments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ds_auth" ON delivery_shipments FOR ALL USING (auth.uid() IS NOT NULL);

-- ── 3. delivery_status_events ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_status_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shipment_id     UUID REFERENCES delivery_shipments(id),
  order_id        UUID REFERENCES orders(id),
  tracking_number TEXT,
  external_status TEXT NOT NULL,
  internal_status TEXT NOT NULL,
  event_time      TIMESTAMPTZ,
  raw_payload     JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dse_shipment   ON delivery_status_events(shipment_id);
CREATE INDEX IF NOT EXISTS idx_dse_order      ON delivery_status_events(order_id);
CREATE INDEX IF NOT EXISTS idx_dse_tracking   ON delivery_status_events(tracking_number);
CREATE INDEX IF NOT EXISTS idx_dse_created    ON delivery_status_events(created_at DESC);
ALTER TABLE delivery_status_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dse_auth" ON delivery_status_events FOR ALL USING (auth.uid() IS NOT NULL);

-- ── 4. delivery_invoices ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_invoices (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  delivery_company_id UUID REFERENCES delivery_companies(id),
  invoice_number      TEXT NOT NULL,
  invoice_date        DATE,
  total_amount_mad    NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid_amount_mad     NUMERIC(14,2) NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'imported',  -- imported|reconciled|disputed
  file_url            TEXT,
  raw_payload         JSONB DEFAULT '{}'::jsonb,
  imported_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_di_company  ON delivery_invoices(delivery_company_id);
CREATE INDEX IF NOT EXISTS idx_di_number   ON delivery_invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_di_date     ON delivery_invoices(invoice_date DESC);
ALTER TABLE delivery_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "di_auth" ON delivery_invoices FOR ALL USING (auth.uid() IS NOT NULL);

-- ── 5. delivery_invoice_items ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_invoice_items (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id       UUID NOT NULL REFERENCES delivery_invoices(id) ON DELETE CASCADE,
  order_id         UUID REFERENCES orders(id),
  tracking_number  TEXT,
  cod_amount_mad   NUMERIC(12,2) DEFAULT 0,
  delivery_fee_mad NUMERIC(12,2) DEFAULT 0,
  return_fee_mad   NUMERIC(12,2) DEFAULT 0,
  amount_paid_mad  NUMERIC(12,2) DEFAULT 0,
  invoice_status   TEXT,            -- livré|retour|perdu etc. from invoice
  matched_status   TEXT DEFAULT 'pending',  -- pending|matched|mismatched
  mismatch_reason  TEXT,
  raw_payload      JSONB DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dii_invoice   ON delivery_invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_dii_order     ON delivery_invoice_items(order_id);
CREATE INDEX IF NOT EXISTS idx_dii_tracking  ON delivery_invoice_items(tracking_number);
CREATE INDEX IF NOT EXISTS idx_dii_matched   ON delivery_invoice_items(matched_status);
ALTER TABLE delivery_invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dii_auth" ON delivery_invoice_items FOR ALL USING (auth.uid() IS NOT NULL);

-- ── 6. delivery_reconciliation_logs ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_reconciliation_logs (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id         UUID REFERENCES delivery_invoices(id),
  total_orders       INT NOT NULL DEFAULT 0,
  matched_orders     INT NOT NULL DEFAULT 0,
  missing_orders     INT NOT NULL DEFAULT 0,
  amount_expected_mad NUMERIC(14,2) DEFAULT 0,
  amount_paid_mad    NUMERIC(14,2) DEFAULT 0,
  difference_mad     NUMERIC(14,2) DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'pending',  -- pending|ok|discrepancy
  details            JSONB DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE delivery_reconciliation_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "drl_auth" ON delivery_reconciliation_logs FOR ALL USING (auth.uid() IS NOT NULL);

-- ── 7. delivery_documents ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_documents (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  delivery_company_id UUID REFERENCES delivery_companies(id),
  document_type       TEXT NOT NULL,  -- bon_livraison|bon_ramassage|bon_retour
  document_date       DATE NOT NULL,
  file_url            TEXT,
  external_id         TEXT,
  raw_payload         JSONB DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dd_company ON delivery_documents(delivery_company_id);
CREATE INDEX IF NOT EXISTS idx_dd_date    ON delivery_documents(document_date DESC);
CREATE INDEX IF NOT EXISTS idx_dd_type    ON delivery_documents(document_type);
ALTER TABLE delivery_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dd_auth" ON delivery_documents FOR ALL USING (auth.uid() IS NOT NULL);

-- ── 8. Orders — add missing columns ───────────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_company_id        UUID REFERENCES delivery_companies(id),
  ADD COLUMN IF NOT EXISTS external_delivery_id       TEXT,
  ADD COLUMN IF NOT EXISTS delivery_external_status   TEXT,
  ADD COLUMN IF NOT EXISTS delivery_last_sync_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_proof_invoice_id   UUID REFERENCES delivery_invoices(id);

CREATE INDEX IF NOT EXISTS idx_orders_delivery_company ON orders(delivery_company_id);
CREATE INDEX IF NOT EXISTS idx_orders_external_del     ON orders(external_delivery_id);

-- ── 9. Seed Digylog company ───────────────────────────────────────────────────
INSERT INTO delivery_companies (name, slug, api_base_url, is_active)
VALUES ('Digylog', 'digylog', 'https://api.digylog.com', true)
ON CONFLICT (slug) DO NOTHING;
