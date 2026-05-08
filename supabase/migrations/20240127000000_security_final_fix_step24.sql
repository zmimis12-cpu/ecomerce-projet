-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: Security Final Fix — Step 24
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Fix 1: Functions missing SET search_path ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.compute_order_estimated_profit(p_order_id UUID)
RETURNS NUMERIC LANGUAGE plpgsql
SECURITY INVOKER SET search_path = public STABLE AS $$
DECLARE v_profit NUMERIC;
BEGIN
  SELECT COALESCE(estimated_profit, 0) INTO v_profit FROM orders WHERE id = p_order_id;
  RETURN v_profit;
END; $$;

CREATE OR REPLACE FUNCTION public.compute_order_real_profit(p_order_id UUID)
RETURNS NUMERIC LANGUAGE plpgsql
SECURITY INVOKER SET search_path = public STABLE AS $$
DECLARE v_profit NUMERIC;
BEGIN
  SELECT COALESCE(real_profit_mad, 0) INTO v_profit FROM orders WHERE id = p_order_id;
  RETURN v_profit;
END; $$;

-- ── Fix 2: Revoke anon from SECURITY DEFINER auth functions ───────────────────
-- Note: REVOKE must reference exact signature
REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_role() FROM anon;
GRANT  EXECUTE ON FUNCTION public.current_user_role() TO authenticated;

REVOKE ALL ON FUNCTION public.user_has_role(VARIADIC user_role[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_has_role(VARIADIC user_role[]) FROM anon;
GRANT  EXECUTE ON FUNCTION public.user_has_role(VARIADIC user_role[]) TO authenticated;

REVOKE ALL ON FUNCTION public.current_user_shop_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_shop_id() FROM anon;
GRANT  EXECUTE ON FUNCTION public.current_user_shop_id() TO authenticated;

-- ── Fix 3: RLS policies for tables with no policies ───────────────────────────

-- ad_adsets
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='ad_adsets') THEN
    ALTER TABLE ad_adsets ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "adsets_auth" ON ad_adsets;
    CREATE POLICY "adsets_auth" ON ad_adsets
      FOR ALL USING (user_has_role('admin','super_admin','manager'));
  END IF;
END $$;

-- brands
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='brands') THEN
    ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "brands_auth" ON brands;
    CREATE POLICY "brands_auth" ON brands
      FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- carriers
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='carriers') THEN
    ALTER TABLE carriers ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "carriers_auth" ON carriers;
    CREATE POLICY "carriers_auth" ON carriers
      FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- categories
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='categories') THEN
    ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "categories_auth" ON categories;
    CREATE POLICY "categories_auth" ON categories
      FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- order_profit_detail
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='order_profit_detail') THEN
    ALTER TABLE order_profit_detail ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "opd_auth" ON order_profit_detail;
    CREATE POLICY "opd_auth" ON order_profit_detail
      FOR ALL USING (user_has_role('admin','super_admin','manager','finance'));
  END IF;
END $$;

-- order_rate_limits
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='order_rate_limits') THEN
    ALTER TABLE order_rate_limits ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "orl_insert_anon" ON order_rate_limits;
    DROP POLICY IF EXISTS "orl_select_admin" ON order_rate_limits;
    -- anon needs INSERT for rate limiting on LP
    CREATE POLICY "orl_insert_anon" ON order_rate_limits
      FOR INSERT WITH CHECK (true);
    CREATE POLICY "orl_select_admin" ON order_rate_limits
      FOR SELECT USING (user_has_role('admin','super_admin','manager'));
  END IF;
END $$;

-- product_bundles
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='product_bundles') THEN
    ALTER TABLE product_bundles ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "pb_auth" ON product_bundles;
    CREATE POLICY "pb_auth" ON product_bundles
      FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- product_cost_history
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='product_cost_history') THEN
    ALTER TABLE product_cost_history ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "pch_auth" ON product_cost_history;
    CREATE POLICY "pch_auth" ON product_cost_history
      FOR ALL USING (user_has_role('admin','super_admin','manager','finance'));
  END IF;
END $$;

-- shipment_events (alias for delivery_status_events check)
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='shipment_events') THEN
    ALTER TABLE shipment_events ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "se2_select_auth" ON shipment_events;
    DROP POLICY IF EXISTS "se2_insert_auth" ON shipment_events;
    CREATE POLICY "se2_select_auth" ON shipment_events
      FOR SELECT USING (auth.uid() IS NOT NULL);
    CREATE POLICY "se2_insert_auth" ON shipment_events
      FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- shops
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='shops') THEN
    ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "shops_auth" ON shops;
    CREATE POLICY "shops_auth" ON shops
      FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- sync_conflicts
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='sync_conflicts') THEN
    ALTER TABLE sync_conflicts ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "sc_auth" ON sync_conflicts;
    CREATE POLICY "sc_auth" ON sync_conflicts
      FOR ALL USING (user_has_role('admin','super_admin','manager'));
  END IF;
END $$;
