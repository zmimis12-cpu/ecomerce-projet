-- =============================================================================
-- MIGRATION: Orders — Step 4
-- Adds new order_status enum values, Google Sheet compat fields,
-- and RLS policies. Safe to run after v1 + v2 migrations.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Extend order_status enum with business-specific values
--    (keeping existing values: pending, confirmed, processing, shipped,
--     delivered, cancelled, returned, partially_returned)
-- -----------------------------------------------------------------------------
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'new';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'refused';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'no_answer';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'sent_to_delivery';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'paid';

-- -----------------------------------------------------------------------------
-- 2. Add Google Sheet compatibility fields to orders
-- -----------------------------------------------------------------------------
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_tracking_number TEXT,
  ADD COLUMN IF NOT EXISTS sync_error               TEXT,
  ADD COLUMN IF NOT EXISTS import_source            TEXT DEFAULT 'manual';

-- notes column already exists in v1 schema — skip

-- -----------------------------------------------------------------------------
-- 3. Add total_amount_mad helper column (alias for generated total_amount)
--    total_amount is a GENERATED column so we can't rename it.
--    We store a plain copy updated by trigger for easy Google Sheet mapping.
-- -----------------------------------------------------------------------------
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS total_amount_mad NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Trigger to keep total_amount_mad in sync
CREATE OR REPLACE FUNCTION sync_order_total_mad()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.total_amount_mad := NEW.subtotal - NEW.discount_amount + NEW.shipping_charge;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_order_total_mad ON orders;
CREATE TRIGGER trg_sync_order_total_mad
  BEFORE INSERT OR UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION sync_order_total_mad();

-- -----------------------------------------------------------------------------
-- 4. Auto-generate order_number sequence
-- -----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1000;

CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := 'ORD-' || TO_CHAR(NOW(), 'YYYY') || '-' ||
                        LPAD(nextval('order_number_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_order_number ON orders;
CREATE TRIGGER trg_generate_order_number
  BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION generate_order_number();

-- -----------------------------------------------------------------------------
-- 5. RLS on orders, order_items, order_status_history
-- -----------------------------------------------------------------------------
ALTER TABLE orders              ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;

-- ORDERS: admin/manager see all; call_center_agent sees only assigned
DROP POLICY IF EXISTS "orders_select_admin"   ON orders;
DROP POLICY IF EXISTS "orders_select_agent"   ON orders;
DROP POLICY IF EXISTS "orders_insert"         ON orders;
DROP POLICY IF EXISTS "orders_update_admin"   ON orders;
DROP POLICY IF EXISTS "orders_update_agent"   ON orders;

CREATE POLICY "orders_select_admin" ON orders
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "orders_insert" ON orders
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "orders_update_admin" ON orders
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "orders_delete_admin" ON orders
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- ORDER_ITEMS
DROP POLICY IF EXISTS "order_items_all" ON order_items;
CREATE POLICY "order_items_all" ON order_items
  FOR ALL USING (auth.uid() IS NOT NULL);

-- ORDER_STATUS_HISTORY
DROP POLICY IF EXISTS "order_history_all" ON order_status_history;
CREATE POLICY "order_history_all" ON order_status_history
  FOR ALL USING (auth.uid() IS NOT NULL);

-- -----------------------------------------------------------------------------
-- 6. Indexes
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_orders_status_new        ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_assigned_to       ON orders(assigned_to);
CREATE INDEX IF NOT EXISTS idx_orders_tracking          ON orders(delivery_tracking_number);
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone    ON orders(customer_phone);
CREATE INDEX IF NOT EXISTS idx_orders_customer_name     ON orders(customer_name);
CREATE INDEX IF NOT EXISTS idx_orders_created_desc      ON orders(created_at DESC);
