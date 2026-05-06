-- =============================================================================
-- MIGRATION: Delivery Batches — Digylog Grouping System
-- =============================================================================

-- ── 1. delivery_batches ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_batches (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_number TEXT UNIQUE NOT NULL,
  provider     TEXT NOT NULL DEFAULT 'digylog',
  status       TEXT NOT NULL DEFAULT 'draft',
    -- draft | tickets_printed | bl_generated | completed (legacy: sent | labels_downloaded | bl_downloaded)
  total_orders   INTEGER NOT NULL DEFAULT 0,
  total_products INTEGER NOT NULL DEFAULT 0,
  bl_id          INTEGER,
  notes          TEXT,
  created_by     UUID REFERENCES auth.users(id),
  sent_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_db_status     ON delivery_batches(status);
CREATE INDEX IF NOT EXISTS idx_db_created    ON delivery_batches(created_at DESC);
ALTER TABLE delivery_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "batches_auth" ON delivery_batches FOR ALL USING (auth.uid() IS NOT NULL);

-- Auto batch number: BATCH-YYYYMM-NNN
CREATE SEQUENCE IF NOT EXISTS batch_number_seq START 1;
CREATE OR REPLACE FUNCTION generate_batch_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.batch_number IS NULL OR NEW.batch_number = '' THEN
    NEW.batch_number := 'BATCH-' || TO_CHAR(NOW(), 'YYYYMM') || '-' ||
                        LPAD(nextval('batch_number_seq')::TEXT, 3, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_batch_number ON delivery_batches;
CREATE TRIGGER trg_batch_number
  BEFORE INSERT ON delivery_batches
  FOR EACH ROW EXECUTE FUNCTION generate_batch_number();

-- ── 2. delivery_batch_orders ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_batch_orders (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id        UUID NOT NULL REFERENCES delivery_batches(id) ON DELETE CASCADE,
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  tracking_number TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
    -- pending | sent | failed
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(batch_id, order_id)
);
CREATE INDEX IF NOT EXISTS idx_dbo_batch ON delivery_batch_orders(batch_id);
CREATE INDEX IF NOT EXISTS idx_dbo_order ON delivery_batch_orders(order_id);
ALTER TABLE delivery_batch_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "batchorders_auth" ON delivery_batch_orders FOR ALL USING (auth.uid() IS NOT NULL);

-- ── 3. delivery_batch_product_summary ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_batch_product_summary (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id      UUID NOT NULL REFERENCES delivery_batches(id) ON DELETE CASCADE,
  product_id    UUID REFERENCES products(id),
  product_name  TEXT NOT NULL,
  sku           TEXT,
  total_quantity INTEGER NOT NULL DEFAULT 0,
  order_count    INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dbps_batch ON delivery_batch_product_summary(batch_id);
CREATE INDEX IF NOT EXISTS idx_dbps_qty   ON delivery_batch_product_summary(total_quantity DESC);
ALTER TABLE delivery_batch_product_summary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "batchproducts_auth" ON delivery_batch_product_summary FOR ALL USING (auth.uid() IS NOT NULL);

-- ── 4. Add delivery_batch_id to orders ───────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_batch_id UUID REFERENCES delivery_batches(id);
CREATE INDEX IF NOT EXISTS idx_orders_batch ON orders(delivery_batch_id) WHERE delivery_batch_id IS NOT NULL;

-- ── Step 16 additions ─────────────────────────────────────────────────────────
ALTER TABLE delivery_batches
  ADD COLUMN IF NOT EXISTS payment_status  TEXT NOT NULL DEFAULT 'unpaid',
    -- unpaid | partial | paid
  ADD COLUMN IF NOT EXISTS shipping_company TEXT,
  ADD COLUMN IF NOT EXISTS store_name      TEXT,
  ADD COLUMN IF NOT EXISTS completed_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_by         UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_db_payment ON delivery_batches(payment_status);

-- ── Step 17 additions ─────────────────────────────────────────────────────────
ALTER TABLE delivery_batches
  ADD COLUMN IF NOT EXISTS labels_downloaded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS labels_downloaded_by UUID REFERENCES auth.users(id);

-- ── Daily batch mode additions ────────────────────────────────────────────────
ALTER TABLE delivery_batches
  ADD COLUMN IF NOT EXISTS batch_date DATE NOT NULL DEFAULT CURRENT_DATE;

-- Index for fast daily batch lookup
CREATE INDEX IF NOT EXISTS idx_db_date_store
  ON delivery_batches(batch_date, store_name, shipping_company, status);

-- New batch number trigger: BATCH-YYYYMMDD-NNN
CREATE OR REPLACE FUNCTION generate_batch_number()
RETURNS TRIGGER AS $$
DECLARE
  date_str TEXT;
  day_seq  INTEGER;
BEGIN
  IF NEW.batch_number IS NULL OR NEW.batch_number = '' THEN
    date_str := TO_CHAR(COALESCE(NEW.batch_date, CURRENT_DATE), 'YYYYMMDD');
    SELECT COUNT(*) + 1 INTO day_seq
      FROM delivery_batches
     WHERE batch_date = COALESCE(NEW.batch_date, CURRENT_DATE)
       AND store_name = NEW.store_name
       AND shipping_company = NEW.shipping_company;
    NEW.batch_number := 'BATCH-' || date_str || '-' || LPAD(day_seq::TEXT, 3, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── delivery_daily_bls — one row per day/provider/store ───────────────────────
CREATE TABLE IF NOT EXISTS delivery_daily_bls (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider       TEXT NOT NULL DEFAULT 'digylog',
  store_name     TEXT NOT NULL,
  business_date  DATE NOT NULL,
  bl_id          INTEGER,
  total_orders   INTEGER NOT NULL DEFAULT 0,
  total_trackings INTEGER NOT NULL DEFAULT 0,
  total_cod      NUMERIC(14,2) NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  generated_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, store_name, business_date)
);
ALTER TABLE delivery_daily_bls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dbl_auth" ON delivery_daily_bls FOR ALL USING (auth.uid() IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_dbl_date ON delivery_daily_bls(business_date DESC);
