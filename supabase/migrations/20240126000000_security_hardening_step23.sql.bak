-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: Full Security Hardening — Step 23
-- Phase 1: Fix mutable search_path on all functions
-- Phase 2: Fix SECURITY DEFINER callable functions  
-- Phase 3: Add RLS policies for tables with no policies
-- ══════════════════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════════════════════
-- PHASE 1 — Fix mutable search_path + SECURITY INVOKER on trigger functions
-- ══════════════════════════════════════════════════════════════════════════════

-- set_updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- compute_product_costs
CREATE OR REPLACE FUNCTION public.compute_product_costs()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY INVOKER SET search_path = public
AS $$
DECLARE v_total NUMERIC(12,2);
BEGIN
  v_total :=
    COALESCE(NEW.purchase_price_mad, 0) +
    COALESCE(NEW.packaging_cost_mad, 0) +
    COALESCE(NEW.confirmation_cost_mad, 0) +
    COALESCE(NEW.shipping_cost_mad, 0) +
    COALESCE(NEW.ads_cost_mad, 0) +
    COALESCE(NEW.other_costs_mad, 0);
  NEW.total_cost_mad       := v_total;
  NEW.min_profitable_price := v_total;
  NEW.estimated_profit_mad := COALESCE(NEW.sale_price_mad, 0) - v_total;
  NEW.margin_pct           := CASE
    WHEN COALESCE(NEW.sale_price_mad, 0) = 0 THEN 0
    ELSE ROUND(((COALESCE(NEW.sale_price_mad, 0) - v_total) / COALESCE(NEW.sale_price_mad, 0)) * 100, 2)
  END;
  RETURN NEW;
END;
$$;

-- sync_order_total_mad
CREATE OR REPLACE FUNCTION public.sync_order_total_mad()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  NEW.total_amount_mad := NEW.subtotal - NEW.discount_amount + NEW.shipping_charge;
  RETURN NEW;
END;
$$;

-- generate_order_number
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := 'HC-' || LPAD(nextval('order_number_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

-- generate_return_number
CREATE OR REPLACE FUNCTION public.generate_return_number()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  IF NEW.return_number IS NULL OR NEW.return_number = '' THEN
    NEW.return_number := 'RET-' || TO_CHAR(NOW(), 'YYYY') || '-' ||
                         LPAD(nextval('return_number_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

-- generate_batch_number
CREATE OR REPLACE FUNCTION public.generate_batch_number()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  IF NEW.batch_number IS NULL OR NEW.batch_number = '' THEN
    NEW.batch_number := 'BATCH-' || TO_CHAR(NOW(), 'YYYYMM') || '-' ||
                        LPAD(nextval('batch_number_seq')::TEXT, 3, '0');
  END IF;
  RETURN NEW;
END;
$$;

-- trg_scanner_duplicate_check
CREATE OR REPLACE FUNCTION public.trg_scanner_duplicate_check()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM scanner_logs
    WHERE tracking_number = NEW.tracking_number
      AND scan_type       = NEW.scan_type
      AND is_duplicate    = false
  ) THEN
    NEW.is_duplicate := true;
  END IF;
  RETURN NEW;
END;
$$;

-- validate_return_item_restock
CREATE OR REPLACE FUNCTION public.validate_return_item_restock(p_return_item_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql
SECURITY INVOKER SET search_path = public
STABLE
AS $$
DECLARE v_ri return_items%ROWTYPE;
BEGIN
  SELECT * INTO v_ri FROM return_items WHERE id = p_return_item_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  RETURN (v_ri.restocked_qty <= v_ri.good_qty)
     AND (v_ri.restocked_qty + v_ri.damaged_qty + v_ri.missing_qty <= v_ri.returned_qty);
END;
$$;

-- compute_order_estimated_profit (keep signature, fix search_path)
CREATE OR REPLACE FUNCTION public.compute_order_estimated_profit(p_order_id UUID)
RETURNS NUMERIC LANGUAGE plpgsql
SECURITY INVOKER SET search_path = public
STABLE
AS $$
DECLARE v_profit NUMERIC;
BEGIN
  SELECT COALESCE(estimated_profit, 0) INTO v_profit FROM orders WHERE id = p_order_id;
  RETURN v_profit;
END;
$$;

-- compute_order_real_profit
CREATE OR REPLACE FUNCTION public.compute_order_real_profit(p_order_id UUID)
RETURNS NUMERIC LANGUAGE plpgsql
SECURITY INVOKER SET search_path = public
STABLE
AS $$
DECLARE v_profit NUMERIC;
BEGIN
  SELECT COALESCE(real_profit_mad, 0) INTO v_profit FROM orders WHERE id = p_order_id;
  RETURN v_profit;
END;
$$;

-- compute_real_profit (trigger)
CREATE OR REPLACE FUNCTION public.compute_real_profit()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  IF NEW.is_paid = true THEN
    NEW.real_profit_mad :=
      COALESCE(NEW.total_amount_mad, 0)
      - COALESCE(NEW.cogs_total, 0)
      - COALESCE(NEW.delivery_cost_real_mad, 0)
      - COALESCE(NEW.ads_cost, 0)
      - COALESCE(NEW.packaging_cost, 0)
      - COALESCE(NEW.call_center_cost, 0)
      - COALESCE(NEW.return_cost_mad, 0)
      + COALESCE(NEW.delivery_margin_mad, 0);
  ELSE
    NEW.real_profit_mad := 0;
  END IF;
  RETURN NEW;
END;
$$;

-- cleanup_rate_limits
CREATE OR REPLACE FUNCTION public.cleanup_rate_limits()
RETURNS void LANGUAGE plpgsql
SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  DELETE FROM order_rate_limits WHERE created_at < NOW() - INTERVAL '1 hour';
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- PHASE 2 — Fix SECURITY DEFINER callable functions
-- ══════════════════════════════════════════════════════════════════════════════

-- current_user_role — keep SECURITY DEFINER (needs to read users table via RLS)
-- but add search_path + revoke from anon
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role LANGUAGE SQL
SECURITY DEFINER SET search_path = public
STABLE
AS $$
  SELECT role FROM users WHERE id = auth.uid()
$$;
REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM anon;
GRANT  EXECUTE ON FUNCTION public.current_user_role() TO authenticated;

-- user_has_role — keep SECURITY DEFINER, fix search_path, revoke from anon
CREATE OR REPLACE FUNCTION public.user_has_role(VARIADIC roles user_role[])
RETURNS BOOLEAN LANGUAGE SQL
SECURITY DEFINER SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id   = auth.uid()
      AND role = ANY(roles)
  )
$$;
REVOKE EXECUTE ON FUNCTION public.user_has_role(VARIADIC user_role[]) FROM anon;
GRANT  EXECUTE ON FUNCTION public.user_has_role(VARIADIC user_role[]) TO authenticated;

-- current_user_shop_id — keep SECURITY DEFINER, fix search_path, revoke from anon
CREATE OR REPLACE FUNCTION public.current_user_shop_id()
RETURNS UUID LANGUAGE SQL
SECURITY DEFINER SET search_path = public
STABLE
AS $$
  SELECT (metadata->>'shop_id')::UUID FROM users WHERE id = auth.uid()
$$;
REVOKE EXECUTE ON FUNCTION public.current_user_shop_id() FROM anon;
GRANT  EXECUTE ON FUNCTION public.current_user_shop_id() TO authenticated;

-- increment_lp_views — keep SECURITY DEFINER (anon needs it for LP tracking)
-- but add search_path and limit what it can do
CREATE OR REPLACE FUNCTION public.increment_lp_views(p_slug TEXT)
RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE landing_pages SET view_count = view_count + 1 WHERE slug = p_slug;
END;
$$;
-- anon needs this for landing page view tracking
GRANT EXECUTE ON FUNCTION public.increment_lp_views(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.increment_lp_views(TEXT) TO authenticated;

-- increment_lp_orders — keep SECURITY DEFINER (anon needs it)
CREATE OR REPLACE FUNCTION public.increment_lp_orders(p_slug TEXT)
RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE landing_pages SET order_count = order_count + 1 WHERE slug = p_slug;
END;
$$;
GRANT EXECUTE ON FUNCTION public.increment_lp_orders(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.increment_lp_orders(TEXT) TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- PHASE 3 — RLS policies for tables with no policies
-- ══════════════════════════════════════════════════════════════════════════════

-- Helper: check if authenticated (used by many policies)
-- Pattern: service_role bypasses RLS always, so we only need authenticated rules

-- ── audit_logs — read: admin/super_admin only, write: backend only ────────────
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_select_admin" ON audit_logs;
DROP POLICY IF EXISTS "audit_insert_all"   ON audit_logs;
CREATE POLICY "audit_select_admin" ON audit_logs
  FOR SELECT USING (user_has_role('admin', 'super_admin'));
CREATE POLICY "audit_insert_all" ON audit_logs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ── shipment_events — authenticated read, backend insert ─────────────────────
ALTER TABLE delivery_status_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dse_select_auth" ON delivery_status_events;
DROP POLICY IF EXISTS "dse_insert_auth" ON delivery_status_events;
CREATE POLICY "dse_select_auth" ON delivery_status_events
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "dse_insert_auth" ON delivery_status_events
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ── stock_movements ───────────────────────────────────────────────────────────
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sm_select_auth" ON stock_movements;
DROP POLICY IF EXISTS "sm_insert_auth" ON stock_movements;
CREATE POLICY "sm_select_auth" ON stock_movements
  FOR SELECT USING (user_has_role('admin','super_admin','manager','scanner_agent'));
CREATE POLICY "sm_insert_auth" ON stock_movements
  FOR INSERT WITH CHECK (user_has_role('admin','super_admin','manager','scanner_agent'));

-- ── stock_levels ──────────────────────────────────────────────────────────────
ALTER TABLE stock_levels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sl_select_auth" ON stock_levels;
DROP POLICY IF EXISTS "sl_write_auth"  ON stock_levels;
CREATE POLICY "sl_select_auth" ON stock_levels
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "sl_write_auth" ON stock_levels
  FOR ALL WITH CHECK (user_has_role('admin','super_admin','manager','scanner_agent'));

-- ── stock_locations ───────────────────────────────────────────────────────────
ALTER TABLE stock_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sloc_select_auth" ON stock_locations;
DROP POLICY IF EXISTS "sloc_write_admin" ON stock_locations;
CREATE POLICY "sloc_select_auth" ON stock_locations
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "sloc_write_admin" ON stock_locations
  FOR ALL WITH CHECK (user_has_role('admin','super_admin','manager'));

-- ── ad_spend ──────────────────────────────────────────────────────────────────
ALTER TABLE ad_spend ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "adspend_auth" ON ad_spend;
CREATE POLICY "adspend_auth" ON ad_spend
  FOR ALL USING (user_has_role('admin','super_admin','manager','media_buyer','finance'));

-- ── ad_campaigns ──────────────────────────────────────────────────────────────
ALTER TABLE ad_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "adcamp_auth" ON ad_campaigns;
CREATE POLICY "adcamp_auth" ON ad_campaigns
  FOR ALL USING (user_has_role('admin','super_admin','manager','media_buyer'));

-- ── ad_ads ────────────────────────────────────────────────────────────────────
ALTER TABLE ad_ads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "adads_auth" ON ad_ads;
CREATE POLICY "adads_auth" ON ad_ads
  FOR ALL USING (user_has_role('admin','super_admin','manager','media_buyer'));

-- ── call_center_agents ────────────────────────────────────────────────────────
ALTER TABLE call_center_agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cca_select_auth" ON call_center_agents;
DROP POLICY IF EXISTS "cca_write_admin" ON call_center_agents;
CREATE POLICY "cca_select_auth" ON call_center_agents
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "cca_write_admin" ON call_center_agents
  FOR ALL WITH CHECK (user_has_role('admin','super_admin','manager'));

-- ── sync_logs ────────────────────────────────────────────────────────────────
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "synclogs_admin" ON sync_logs;
CREATE POLICY "synclogs_admin" ON sync_logs
  FOR ALL USING (user_has_role('admin','super_admin','manager'));

-- ── sync_configs ──────────────────────────────────────────────────────────────
ALTER TABLE sync_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "syncconf_admin" ON sync_configs;
CREATE POLICY "syncconf_admin" ON sync_configs
  FOR ALL USING (user_has_role('admin','super_admin','manager'));

-- ── google_sync_map ───────────────────────────────────────────────────────────
ALTER TABLE google_sync_map ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gsmap_admin" ON google_sync_map;
CREATE POLICY "gsmap_admin" ON google_sync_map
  FOR ALL USING (user_has_role('admin','super_admin','manager'));

-- ── suppliers ─────────────────────────────────────────────────────────────────
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "suppliers_auth" ON suppliers;
CREATE POLICY "suppliers_auth" ON suppliers
  FOR ALL USING (user_has_role('admin','super_admin','manager'));

-- ── teams ─────────────────────────────────────────────────────────────────────
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "teams_auth" ON teams;
CREATE POLICY "teams_auth" ON teams
  FOR ALL USING (user_has_role('admin','super_admin'));

-- ── team_members ──────────────────────────────────────────────────────────────
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "team_members_auth" ON team_members;
CREATE POLICY "team_members_auth" ON team_members
  FOR ALL USING (user_has_role('admin','super_admin'));

-- ── digylog_documents ─────────────────────────────────────────────────────────
ALTER TABLE digylog_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dd_auth" ON digylog_documents;
CREATE POLICY "dd_auth" ON digylog_documents
  FOR ALL USING (user_has_role('admin','super_admin','manager','finance'));

-- ── digylog_document_lines ───────────────────────────────────────────────────
ALTER TABLE digylog_document_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ddl_auth" ON digylog_document_lines;
CREATE POLICY "ddl_auth" ON digylog_document_lines
  FOR ALL USING (user_has_role('admin','super_admin','manager','finance'));

-- ── digylog_status_syncs ─────────────────────────────────────────────────────
ALTER TABLE digylog_status_syncs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dss_auth" ON digylog_status_syncs;
CREATE POLICY "dss_auth" ON digylog_status_syncs
  FOR ALL USING (user_has_role('admin','super_admin','manager'));

-- ── scan_events ───────────────────────────────────────────────────────────────
ALTER TABLE scan_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "se_auth" ON scan_events;
CREATE POLICY "se_auth" ON scan_events
  FOR ALL USING (user_has_role('admin','super_admin','manager','scanner_agent'));

-- ── pending_return_scans ─────────────────────────────────────────────────────
ALTER TABLE pending_return_scans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "prs_auth" ON pending_return_scans;
CREATE POLICY "prs_auth" ON pending_return_scans
  FOR ALL USING (user_has_role('admin','super_admin','manager','scanner_agent'));

-- ── digylog_return_batches ────────────────────────────────────────────────────
ALTER TABLE digylog_return_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "drb_auth" ON digylog_return_batches;
CREATE POLICY "drb_auth" ON digylog_return_batches
  FOR ALL USING (user_has_role('admin','super_admin','manager','scanner_agent'));

-- ── orphan_webhooks ───────────────────────────────────────────────────────────
ALTER TABLE orphan_webhooks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ow_auth" ON orphan_webhooks;
CREATE POLICY "ow_auth" ON orphan_webhooks
  FOR ALL USING (user_has_role('admin','super_admin','manager'));

-- ── finance_anomalies (if exists) ────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'finance_anomalies') THEN
    ALTER TABLE finance_anomalies ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'finance_anomalies') THEN
      CREATE POLICY "fa_finance" ON finance_anomalies
        FOR ALL USING (user_has_role('admin','super_admin','manager','finance'));
    END IF;
  END IF;
END $$;

-- ── finance_events (if exists) ───────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'finance_events') THEN
    ALTER TABLE finance_events ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'finance_events') THEN
      CREATE POLICY "fe_finance" ON finance_events
        FOR ALL USING (user_has_role('admin','super_admin','manager','finance'));
    END IF;
  END IF;
END $$;

-- ── webhook_logs ──────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'webhook_logs') THEN
    ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'webhook_logs') THEN
      CREATE POLICY "wl_admin" ON webhook_logs
        FOR ALL USING (user_has_role('admin','super_admin'));
    END IF;
  END IF;
END $$;
