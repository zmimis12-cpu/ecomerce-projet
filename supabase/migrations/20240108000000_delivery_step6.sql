-- =============================================================================
-- MIGRATION: Delivery + Real Profit — Step 6
-- Extends orders with delivery tracking, payment, and real profit fields.
-- All ADD COLUMN use IF NOT EXISTS — safe to re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. New order_status enum values (commit before step 2)
-- -----------------------------------------------------------------------------
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'in_transit';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'refused_delivery';

-- NOTE: Run lines above first, commit, then run the rest.

-- -----------------------------------------------------------------------------
-- 2. Delivery fields on orders
-- -----------------------------------------------------------------------------
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_status       TEXT,          -- mirrors status for delivery filter
  ADD COLUMN IF NOT EXISTS delivery_company      TEXT,          -- e.g. 'DIGYLOG', 'Amana', 'Laposte MA'
  ADD COLUMN IF NOT EXISTS sent_to_delivery_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS returned_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_cost_real_mad NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS return_cost_mad        NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_paid                BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paid_at               TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS real_profit_mad        NUMERIC(12,2);

-- delivery_tracking_number already added in Step 4 migration — skip

-- -----------------------------------------------------------------------------
-- 3. Trigger: auto-compute real_profit_mad when order is delivered + paid
-- Formula:
--   real_profit = total_amount_mad
--                 - cogs_total (unit_cost × qty from order_items)
--                 - delivery_cost_real_mad
--                 - estimated_ads_cost (from orders v2 columns)
--                 - estimated_confirmation_cost
--                 - return_cost_mad
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION compute_real_profit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_cogs NUMERIC(12,2) := 0;
BEGIN
  -- Only compute when both delivered AND paid
  IF NEW.is_paid = true AND NEW.status IN ('delivered', 'paid') THEN

    -- Sum COGS from order_items (snapshot at order time)
    SELECT COALESCE(SUM(line_cogs), 0)
      INTO v_cogs
      FROM order_items
     WHERE order_id = NEW.id;

    NEW.real_profit_mad :=
      COALESCE(NEW.total_amount_mad, 0)
      - v_cogs
      - COALESCE(NEW.delivery_cost_real_mad, 0)
      - COALESCE(NEW.estimated_ads_cost, 0)
      - COALESCE(NEW.estimated_confirmation_cost, 0)
      - COALESCE(NEW.return_cost_mad, 0);

  ELSIF NEW.status IN ('returned', 'refused_delivery') THEN
    -- Loss: return cost + delivery cost (revenue = 0)
    NEW.real_profit_mad :=
      -(COALESCE(NEW.delivery_cost_real_mad, 0) + COALESCE(NEW.return_cost_mad, 0));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compute_real_profit ON orders;
CREATE TRIGGER trg_compute_real_profit
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION compute_real_profit();

-- -----------------------------------------------------------------------------
-- 4. Indexes
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_del_orders_delivery_status  ON orders(delivery_status);
CREATE INDEX IF NOT EXISTS idx_del_orders_is_paid          ON orders(is_paid);
CREATE INDEX IF NOT EXISTS idx_del_orders_delivered_at     ON orders(delivered_at DESC);
CREATE INDEX IF NOT EXISTS idx_del_orders_sent_at          ON orders(sent_to_delivery_at DESC);
CREATE INDEX IF NOT EXISTS idx_del_orders_tracking         ON orders(delivery_tracking_number);

-- Composite: delivery list main query
CREATE INDEX IF NOT EXISTS idx_del_orders_list
  ON orders(delivery_status, is_paid, sent_to_delivery_at DESC)
  WHERE delivery_status IS NOT NULL;
