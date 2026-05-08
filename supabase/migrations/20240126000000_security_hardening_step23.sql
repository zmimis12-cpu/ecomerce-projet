-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: Security Hardening Step 23 (FIXED v2)
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Add missing enum values first ─────────────────────────────────────────────
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'media_buyer';

-- ══════════════════════════════════════════════════════════════════════════════
-- PHASE 1 — Fix mutable search_path on all functions
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.compute_product_costs()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_total NUMERIC(12,2);
BEGIN
  v_total := COALESCE(NEW.purchase_price_mad,0)+COALESCE(NEW.packaging_cost_mad,0)+
    COALESCE(NEW.confirmation_cost_mad,0)+COALESCE(NEW.shipping_cost_mad,0)+
    COALESCE(NEW.ads_cost_mad,0)+COALESCE(NEW.other_costs_mad,0);
  NEW.total_cost_mad:=v_total; NEW.min_profitable_price:=v_total;
  NEW.estimated_profit_mad:=COALESCE(NEW.sale_price_mad,0)-v_total;
  NEW.margin_pct:=CASE WHEN COALESCE(NEW.sale_price_mad,0)=0 THEN 0
    ELSE ROUND(((COALESCE(NEW.sale_price_mad,0)-v_total)/COALESCE(NEW.sale_price_mad,0))*100,2) END;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.sync_order_total_mad()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN NEW.total_amount_mad:=NEW.subtotal-NEW.discount_amount+NEW.shipping_charge; RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number='' THEN
    NEW.order_number:='HC-'||LPAD(nextval('order_number_seq')::TEXT,5,'0');
  END IF; RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.generate_return_number()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.return_number IS NULL OR NEW.return_number='' THEN
    NEW.return_number:='RET-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('return_number_seq')::TEXT,5,'0');
  END IF; RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.generate_batch_number()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.batch_number IS NULL OR NEW.batch_number='' THEN
    NEW.batch_number:='BATCH-'||TO_CHAR(NOW(),'YYYYMM')||'-'||LPAD(nextval('batch_number_seq')::TEXT,3,'0');
  END IF; RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_scanner_duplicate_check()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM scanner_logs WHERE tracking_number=NEW.tracking_number
    AND scan_type=NEW.scan_type AND is_duplicate=false) THEN NEW.is_duplicate:=true; END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.validate_return_item_restock(p_return_item_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY INVOKER SET search_path = public STABLE AS $$
DECLARE v_ri return_items%ROWTYPE;
BEGIN
  SELECT * INTO v_ri FROM return_items WHERE id=p_return_item_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  RETURN (v_ri.restocked_qty<=v_ri.good_qty)
    AND (v_ri.restocked_qty+v_ri.damaged_qty+v_ri.missing_qty<=v_ri.returned_qty);
END; $$;

CREATE OR REPLACE FUNCTION public.cleanup_rate_limits()
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN DELETE FROM order_rate_limits WHERE created_at<NOW()-INTERVAL '1 hour'; END; $$;

CREATE OR REPLACE FUNCTION public.compute_real_profit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.is_paid=true THEN
    NEW.real_profit_mad:=COALESCE(NEW.total_amount_mad,0)-COALESCE(NEW.cogs_total,0)
      -COALESCE(NEW.delivery_cost_real_mad,0)-COALESCE(NEW.ads_cost,0)
      -COALESCE(NEW.packaging_cost,0)-COALESCE(NEW.call_center_cost,0)
      -COALESCE(NEW.return_cost_mad,0)+COALESCE(NEW.delivery_margin_mad,0);
  ELSE NEW.real_profit_mad:=0; END IF;
  RETURN NEW;
END; $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- PHASE 2 — Fix SECURITY DEFINER functions: add search_path + revoke from anon
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role LANGUAGE SQL SECURITY DEFINER SET search_path = public STABLE
AS $$ SELECT role FROM users WHERE id=auth.uid() $$;
REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM anon;
GRANT  EXECUTE ON FUNCTION public.current_user_role() TO authenticated;

CREATE OR REPLACE FUNCTION public.user_has_role(VARIADIC roles user_role[])
RETURNS BOOLEAN LANGUAGE SQL SECURITY DEFINER SET search_path = public STABLE
AS $$ SELECT EXISTS(SELECT 1 FROM users WHERE id=auth.uid() AND role=ANY(roles)) $$;
REVOKE EXECUTE ON FUNCTION public.user_has_role(VARIADIC user_role[]) FROM anon;
GRANT  EXECUTE ON FUNCTION public.user_has_role(VARIADIC user_role[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.current_user_shop_id()
RETURNS UUID LANGUAGE SQL SECURITY DEFINER SET search_path = public STABLE
AS $$ SELECT (metadata->>'shop_id')::UUID FROM users WHERE id=auth.uid() $$;
REVOKE EXECUTE ON FUNCTION public.current_user_shop_id() FROM anon;
GRANT  EXECUTE ON FUNCTION public.current_user_shop_id() TO authenticated;

-- LP tracking: anon access kept (public landing pages need it)
CREATE OR REPLACE FUNCTION public.increment_lp_views(p_slug TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN UPDATE landing_pages SET view_count=view_count+1 WHERE slug=p_slug; END; $$;
GRANT EXECUTE ON FUNCTION public.increment_lp_views(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.increment_lp_orders(p_slug TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN UPDATE landing_pages SET order_count=order_count+1 WHERE slug=p_slug; END; $$;
GRANT EXECUTE ON FUNCTION public.increment_lp_orders(TEXT) TO anon, authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- PHASE 3 — RLS policies (using existing enum values only)
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_select_admin" ON audit_logs;
DROP POLICY IF EXISTS "audit_insert_all"   ON audit_logs;
CREATE POLICY "audit_select_admin" ON audit_logs FOR SELECT USING (user_has_role('admin','super_admin'));
CREATE POLICY "audit_insert_all"   ON audit_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

ALTER TABLE delivery_status_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dse_select_auth" ON delivery_status_events;
DROP POLICY IF EXISTS "dse_insert_auth" ON delivery_status_events;
CREATE POLICY "dse_select_auth" ON delivery_status_events FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "dse_insert_auth" ON delivery_status_events FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sm_select_auth" ON stock_movements;
DROP POLICY IF EXISTS "sm_insert_auth" ON stock_movements;
CREATE POLICY "sm_select_auth" ON stock_movements FOR SELECT USING (user_has_role('admin','super_admin','manager','scanner_agent'));
CREATE POLICY "sm_insert_auth" ON stock_movements FOR INSERT WITH CHECK (user_has_role('admin','super_admin','manager','scanner_agent'));

ALTER TABLE stock_levels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sl_select_auth" ON stock_levels;
DROP POLICY IF EXISTS "sl_write_auth"  ON stock_levels;
CREATE POLICY "sl_select_auth" ON stock_levels FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "sl_write_auth"  ON stock_levels FOR ALL    WITH CHECK (user_has_role('admin','super_admin','manager','scanner_agent'));

ALTER TABLE stock_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sloc_select_auth" ON stock_locations;
DROP POLICY IF EXISTS "sloc_write_admin" ON stock_locations;
CREATE POLICY "sloc_select_auth" ON stock_locations FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "sloc_write_admin" ON stock_locations FOR ALL    WITH CHECK (user_has_role('admin','super_admin','manager'));

ALTER TABLE call_center_agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cca_select_auth" ON call_center_agents;
DROP POLICY IF EXISTS "cca_write_admin" ON call_center_agents;
CREATE POLICY "cca_select_auth" ON call_center_agents FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "cca_write_admin" ON call_center_agents FOR ALL    WITH CHECK (user_has_role('admin','super_admin','manager'));

ALTER TABLE digylog_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dd_auth" ON digylog_documents;
CREATE POLICY "dd_auth" ON digylog_documents FOR ALL USING (user_has_role('admin','super_admin','manager','finance'));

ALTER TABLE digylog_document_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ddl_auth" ON digylog_document_lines;
CREATE POLICY "ddl_auth" ON digylog_document_lines FOR ALL USING (user_has_role('admin','super_admin','manager','finance'));

ALTER TABLE digylog_status_syncs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dss_auth" ON digylog_status_syncs;
CREATE POLICY "dss_auth" ON digylog_status_syncs FOR ALL USING (user_has_role('admin','super_admin','manager'));

ALTER TABLE scan_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "se_auth" ON scan_events;
CREATE POLICY "se_auth" ON scan_events FOR ALL USING (user_has_role('admin','super_admin','manager','scanner_agent'));

ALTER TABLE pending_return_scans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "prs_auth" ON pending_return_scans;
CREATE POLICY "prs_auth" ON pending_return_scans FOR ALL USING (user_has_role('admin','super_admin','manager','scanner_agent'));

ALTER TABLE digylog_return_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "drb_auth" ON digylog_return_batches;
CREATE POLICY "drb_auth" ON digylog_return_batches FOR ALL USING (user_has_role('admin','super_admin','manager','scanner_agent'));

ALTER TABLE orphan_webhooks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ow_auth" ON orphan_webhooks;
CREATE POLICY "ow_auth" ON orphan_webhooks FOR ALL USING (user_has_role('admin','super_admin','manager'));

-- Conditional tables (may not exist in all environments)
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_tables WHERE tablename='ad_spend') THEN
    ALTER TABLE ad_spend ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "adspend_auth" ON ad_spend;
    CREATE POLICY "adspend_auth" ON ad_spend FOR ALL USING (user_has_role('admin','super_admin','manager','finance'));
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_tables WHERE tablename='ad_campaigns') THEN
    ALTER TABLE ad_campaigns ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "adcamp_auth" ON ad_campaigns;
    CREATE POLICY "adcamp_auth" ON ad_campaigns FOR ALL USING (user_has_role('admin','super_admin','manager'));
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_tables WHERE tablename='ad_ads') THEN
    ALTER TABLE ad_ads ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "adads_auth" ON ad_ads;
    CREATE POLICY "adads_auth" ON ad_ads FOR ALL USING (user_has_role('admin','super_admin','manager'));
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_tables WHERE tablename='sync_logs') THEN
    ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "synclogs_admin" ON sync_logs;
    CREATE POLICY "synclogs_admin" ON sync_logs FOR ALL USING (user_has_role('admin','super_admin','manager'));
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_tables WHERE tablename='sync_configs') THEN
    ALTER TABLE sync_configs ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "syncconf_admin" ON sync_configs;
    CREATE POLICY "syncconf_admin" ON sync_configs FOR ALL USING (user_has_role('admin','super_admin','manager'));
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_tables WHERE tablename='google_sync_map') THEN
    ALTER TABLE google_sync_map ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "gsmap_admin" ON google_sync_map;
    CREATE POLICY "gsmap_admin" ON google_sync_map FOR ALL USING (user_has_role('admin','super_admin','manager'));
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_tables WHERE tablename='suppliers') THEN
    ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "suppliers_auth" ON suppliers;
    CREATE POLICY "suppliers_auth" ON suppliers FOR ALL USING (user_has_role('admin','super_admin','manager'));
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_tables WHERE tablename='teams') THEN
    ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "teams_auth" ON teams;
    CREATE POLICY "teams_auth" ON teams FOR ALL USING (user_has_role('admin','super_admin'));
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_tables WHERE tablename='team_members') THEN
    ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "team_members_auth" ON team_members;
    CREATE POLICY "team_members_auth" ON team_members FOR ALL USING (user_has_role('admin','super_admin'));
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_tables WHERE tablename='finance_anomalies') THEN
    ALTER TABLE finance_anomalies ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "fa_finance" ON finance_anomalies;
    CREATE POLICY "fa_finance" ON finance_anomalies FOR ALL USING (user_has_role('admin','super_admin','manager','finance'));
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_tables WHERE tablename='finance_events') THEN
    ALTER TABLE finance_events ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "fe_finance" ON finance_events;
    CREATE POLICY "fe_finance" ON finance_events FOR ALL USING (user_has_role('admin','super_admin','manager','finance'));
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_tables WHERE tablename='webhook_logs') THEN
    ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "wl_admin" ON webhook_logs;
    CREATE POLICY "wl_admin" ON webhook_logs FOR ALL USING (user_has_role('admin','super_admin'));
  END IF;
END $$;

-- ── Fix ROAS views without daily_budget_mad (column doesn't exist) ─────────────
DROP VIEW IF EXISTS public.v_roas_by_campaign CASCADE;
CREATE VIEW public.v_roas_by_campaign WITH (security_invoker=true) AS
SELECT ac.id AS campaign_id, ac.name AS campaign_name, ac.platform,
  COUNT(o.id) AS total_orders,
  COALESCE(SUM(o.total_amount_mad),0) AS total_revenue,
  COALESCE(SUM(o.total_amount_mad) FILTER (WHERE o.is_paid),0) AS real_revenue,
  COALESCE(SUM(o.real_profit_mad)  FILTER (WHERE o.is_paid),0) AS real_profit
FROM ad_campaigns ac
LEFT JOIN orders o ON o.ad_campaign_id=ac.id AND o.status NOT IN ('cancelled')
GROUP BY ac.id, ac.name, ac.platform;

DROP VIEW IF EXISTS public.v_roas_by_adset CASCADE;
CREATE VIEW public.v_roas_by_adset WITH (security_invoker=true) AS
SELECT oas.id AS adset_id, oas.name AS adset_name, ac.id AS campaign_id, ac.name AS campaign_name,
  COUNT(o.id) AS total_orders,
  COALESCE(SUM(o.total_amount_mad),0) AS total_revenue,
  COALESCE(SUM(o.total_amount_mad) FILTER (WHERE o.is_paid),0) AS real_revenue,
  COALESCE(SUM(o.real_profit_mad)  FILTER (WHERE o.is_paid),0) AS real_profit
FROM ad_adsets oas
JOIN ad_campaigns ac ON ac.id=oas.campaign_id
LEFT JOIN orders o ON o.ad_adset_id=oas.id AND o.status NOT IN ('cancelled')
GROUP BY oas.id, oas.name, ac.id, ac.name;

GRANT SELECT ON public.v_roas_by_campaign TO authenticated;
GRANT SELECT ON public.v_roas_by_adset    TO authenticated;
