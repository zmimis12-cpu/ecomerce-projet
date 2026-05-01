-- =============================================================================
-- MIGRATION: Order duplicate detection
-- Adds is_duplicate flag and duplicate_of FK to orders table.
-- =============================================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS is_duplicate  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS duplicate_of  UUID REFERENCES orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_duplicate    ON orders(is_duplicate) WHERE is_duplicate = true;
CREATE INDEX IF NOT EXISTS idx_orders_duplicate_of ON orders(duplicate_of);

-- Function: check for duplicate order before insert
-- Looks for same phone + same product + last 24h + non-cancelled status
CREATE OR REPLACE FUNCTION detect_duplicate_order()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_existing_order_id UUID;
BEGIN
  -- Only check on INSERT (not UPDATE)
  IF TG_OP != 'INSERT' THEN RETURN NEW; END IF;
  -- Skip if already flagged manually
  IF NEW.is_duplicate = true THEN RETURN NEW; END IF;

  SELECT o.id INTO v_existing_order_id
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  WHERE o.customer_phone = NEW.customer_phone
    AND o.status NOT IN ('cancelled', 'returned')
    AND o.created_at >= NOW() - INTERVAL '24 hours'
    AND o.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID)
  LIMIT 1;

  IF v_existing_order_id IS NOT NULL THEN
    NEW.is_duplicate := true;
    NEW.duplicate_of := v_existing_order_id;
  END IF;

  RETURN NEW;
END;
$$;

-- NOTE: This trigger runs AFTER generate_order_number but checks order_items
-- which don't exist yet at INSERT time. The product-level check is done
-- in the application layer (actions.ts) for accuracy.
-- The DB trigger handles phone-level duplicate detection as a safety net.

DROP TRIGGER IF EXISTS trg_detect_duplicate_order ON orders;
CREATE TRIGGER trg_detect_duplicate_order
  BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION detect_duplicate_order();
