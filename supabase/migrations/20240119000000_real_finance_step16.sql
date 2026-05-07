-- ── Migration: Real Finance System ──────────────────────────────────────────
-- Add delivery margin columns + finance anomaly table

-- ── 1. New columns on orders ──────────────────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS expected_delivery_cost   NUMERIC(12,2) NOT NULL DEFAULT 35,
  ADD COLUMN IF NOT EXISTS actual_delivery_cost     NUMERIC(12,2) NOT NULL DEFAULT 35,
  ADD COLUMN IF NOT EXISTS delivery_client_fee      NUMERIC(12,2) NOT NULL DEFAULT 35,
  ADD COLUMN IF NOT EXISTS delivery_margin          NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_overcharge      NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ads_cost                 NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS packaging_cost           NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS call_center_cost         NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_status           TEXT          NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS real_profit_computed     NUMERIC(12,2);

-- ── 2. Finance anomalies table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance_anomalies (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id         UUID REFERENCES orders(id) ON DELETE CASCADE,
  tracking_number  TEXT,
  anomaly_type     TEXT NOT NULL,  -- delivery_overcharge|cod_mismatch|unpaid_delivered|negative_profit|missing_payout
  expected_value   NUMERIC(12,2),
  actual_value     NUMERIC(12,2),
  difference       NUMERIC(12,2),
  description      TEXT,
  resolved         BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fa_order   ON finance_anomalies(order_id);
CREATE INDEX IF NOT EXISTS idx_fa_type    ON finance_anomalies(anomaly_type);
CREATE INDEX IF NOT EXISTS idx_fa_resolved ON finance_anomalies(resolved);
ALTER TABLE finance_anomalies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fa_auth" ON finance_anomalies FOR ALL USING (auth.uid() IS NOT NULL);

-- ── 3. Finance events (audit trail) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance_events (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id     UUID REFERENCES orders(id) ON DELETE CASCADE,
  old_profit   NUMERIC(12,2),
  new_profit   NUMERIC(12,2),
  reason       TEXT,
  source       TEXT,  -- webhook|reconciliation|manual|trigger
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fe_order ON finance_events(order_id);
ALTER TABLE finance_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fe_auth" ON finance_events FOR ALL USING (auth.uid() IS NOT NULL);

-- ── 4. Updated real_profit trigger with delivery margin ───────────────────────
CREATE OR REPLACE FUNCTION compute_real_profit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_cogs              NUMERIC(12,2) := 0;
  v_city_lower        TEXT;
  v_expected_delivery NUMERIC(12,2);
  v_delivery_margin   NUMERIC(12,2);
  v_client_fee        NUMERIC(12,2) := 35;
BEGIN
  -- Determine expected delivery cost by city
  v_city_lower := LOWER(COALESCE(NEW.customer_city, ''));
  IF v_city_lower LIKE '%casablanca%'
    OR v_city_lower LIKE '%casa%'
    OR v_city_lower LIKE '%البيضاء%'
    OR v_city_lower LIKE '%hay albaraka%'
    OR v_city_lower LIKE '%albaraka%'
  THEN
    v_expected_delivery := 25;
  ELSE
    v_expected_delivery := 35;
  END IF;

  -- Delivery margin = client fee - expected cost
  v_delivery_margin := v_client_fee - v_expected_delivery;

  -- Always update expected cost + margin
  NEW.expected_delivery_cost := v_expected_delivery;
  NEW.delivery_client_fee    := v_client_fee;
  NEW.delivery_margin        := v_delivery_margin;

  -- Compute real profit only for delivered + paid orders
  IF NEW.is_paid = true AND NEW.status IN ('delivered', 'paid') THEN
    SELECT COALESCE(SUM(line_cogs), 0)
      INTO v_cogs
      FROM order_items
     WHERE order_id = NEW.id;

    NEW.real_profit_mad :=
      COALESCE(NEW.total_amount_mad, 0)
      - v_cogs
      - v_expected_delivery          -- use expected (not actual) as base
      + v_delivery_margin            -- add margin back
      - COALESCE(NEW.actual_delivery_cost, v_expected_delivery) + v_expected_delivery  -- actual vs expected delta
      - COALESCE(NEW.estimated_ads_cost, 0)
      - COALESCE(NEW.estimated_confirmation_cost, 0)
      - COALESCE(NEW.return_cost_mad, 0);

    -- Simplified: real_profit = COD - COGS - actual_delivery_cost - ads - cc - return
    NEW.real_profit_mad :=
      COALESCE(NEW.total_amount_mad, 0)
      - v_cogs
      - COALESCE(NEW.actual_delivery_cost, v_expected_delivery)
      - COALESCE(NEW.estimated_ads_cost, 0)
      - COALESCE(NEW.estimated_confirmation_cost, 0)
      - COALESCE(NEW.return_cost_mad, 0);

    NEW.payment_status := 'paid';

  ELSIF NEW.status IN ('returned', 'refused_delivery') THEN
    NEW.real_profit_mad :=
      -(COALESCE(NEW.actual_delivery_cost, v_expected_delivery)
        + COALESCE(NEW.return_cost_mad, 0));
    NEW.payment_status := 'returned';

  ELSIF NEW.status IN ('delivered') AND (NEW.is_paid IS NULL OR NEW.is_paid = false) THEN
    NEW.payment_status := 'delivered_unpaid';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compute_real_profit ON orders;
CREATE TRIGGER trg_compute_real_profit
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION compute_real_profit();

-- ── 5. Backfill expected_delivery_cost for existing orders ───────────────────
UPDATE orders SET
  expected_delivery_cost = CASE
    WHEN LOWER(COALESCE(customer_city,'')) LIKE '%casablanca%'
      OR LOWER(COALESCE(customer_city,'')) LIKE '%casa%'
      OR LOWER(COALESCE(customer_city,'')) LIKE '%hay albaraka%'
      OR LOWER(COALESCE(customer_city,'')) LIKE '%albaraka%'
    THEN 25
    ELSE 35
  END,
  delivery_client_fee = 35,
  delivery_margin = CASE
    WHEN LOWER(COALESCE(customer_city,'')) LIKE '%casablanca%'
      OR LOWER(COALESCE(customer_city,'')) LIKE '%casa%'
      OR LOWER(COALESCE(customer_city,'')) LIKE '%hay albaraka%'
      OR LOWER(COALESCE(customer_city,'')) LIKE '%albaraka%'
    THEN 10
    ELSE 0
  END
WHERE expected_delivery_cost = 35;  -- only update defaults
