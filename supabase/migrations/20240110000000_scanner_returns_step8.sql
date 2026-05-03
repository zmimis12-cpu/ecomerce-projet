-- =============================================================================
-- MIGRATION: Scanner + Returns — Step 8
-- Extends scanner_logs, return_items, adds stock helpers.
-- All ADD COLUMN use IF NOT EXISTS — safe to re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. scanner_logs — add missing fields if not present
-- -----------------------------------------------------------------------------
ALTER TABLE scanner_logs
  ADD COLUMN IF NOT EXISTS return_condition  TEXT,   -- set when scan_type = 'return'
  ADD COLUMN IF NOT EXISTS notes             TEXT,
  ADD COLUMN IF NOT EXISTS processed         BOOLEAN NOT NULL DEFAULT false;

-- RLS policies for scanner_agent role
DROP POLICY IF EXISTS "scanner_insert_scans" ON scanner_logs;
DROP POLICY IF EXISTS "scanner_select_scans" ON scanner_logs;

CREATE POLICY "scanner_insert_scans" ON scanner_logs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "scanner_select_scans" ON scanner_logs
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "scanner_update_scans" ON scanner_logs
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- -----------------------------------------------------------------------------
-- 2. return_items — ensure v2 qty fields exist (from v2 migration)
-- -----------------------------------------------------------------------------
ALTER TABLE return_items
  ADD COLUMN IF NOT EXISTS returned_qty    INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS good_qty        INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS damaged_qty     INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS missing_qty     INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS restocked_qty   INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_cost_mad   NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS write_off_value NUMERIC(12,2);

-- -----------------------------------------------------------------------------
-- 3. returns — add fields for Google Sheets compat + financial tracking
-- -----------------------------------------------------------------------------
ALTER TABLE returns
  ADD COLUMN IF NOT EXISTS total_loss_mad       NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS claim_amount_mad     NUMERIC(12,2),  -- to claim from carrier
  ADD COLUMN IF NOT EXISTS return_number_auto   TEXT;           -- auto-generated

-- Auto-generate return_number if not set
CREATE SEQUENCE IF NOT EXISTS return_number_seq START 1000;

CREATE OR REPLACE FUNCTION generate_return_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.return_number IS NULL OR NEW.return_number = '' THEN
    NEW.return_number := 'RET-' || TO_CHAR(NOW(), 'YYYY') || '-' ||
                         LPAD(nextval('return_number_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_return_number ON returns;
CREATE TRIGGER trg_generate_return_number
  BEFORE INSERT ON returns
  FOR EACH ROW EXECUTE FUNCTION generate_return_number();

-- -----------------------------------------------------------------------------
-- 4. RLS on returns tables
-- -----------------------------------------------------------------------------
ALTER TABLE returns      ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "returns_all_authenticated" ON returns;
DROP POLICY IF EXISTS "return_items_all_authenticated" ON return_items;

CREATE POLICY "returns_all_authenticated" ON returns
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "return_items_all_authenticated" ON return_items
  FOR ALL USING (auth.uid() IS NOT NULL);

-- -----------------------------------------------------------------------------
-- 5. Stock locations — ensure default location exists
-- This is called in stock adjustments — we need at least one location.
-- -----------------------------------------------------------------------------
INSERT INTO stock_locations (name, code, type, is_active)
VALUES ('Entrepôt Principal', 'MAIN', 'warehouse', true)
ON CONFLICT (code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 6. Indexes
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_returns_order_id    ON returns(order_id);
CREATE INDEX IF NOT EXISTS idx_returns_status      ON returns(status);
CREATE INDEX IF NOT EXISTS idx_returns_created     ON returns(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_return_items_return ON return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_return_items_product ON return_items(product_id);
