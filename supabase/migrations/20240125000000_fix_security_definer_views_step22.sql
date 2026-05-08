-- ── Migration: Fix SECURITY DEFINER views → SECURITY INVOKER ─────────────────
-- Supabase security linter requires views to use SECURITY INVOKER (default)
-- so RLS on underlying tables is respected.
-- All views below are recreated WITHOUT security definer.

-- ── 1. v_stock_summary ────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_stock_summary CASCADE;
CREATE VIEW public.v_stock_summary
  WITH (security_invoker = true)
AS
SELECT
  p.id              AS product_id,
  p.sku,
  p.name,
  p.selling_price,
  p.landing_cost_mad,
  SUM(sl.quantity)  AS total_qty,
  SUM(sl.reserved)  AS total_reserved,
  SUM(sl.available) AS total_available
FROM products p
LEFT JOIN stock_levels sl ON sl.product_id = p.id
WHERE p.is_active = true AND p.track_stock = true
GROUP BY p.id, p.sku, p.name, p.selling_price, p.landing_cost_mad;

-- ── 2. v_order_summary ───────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_order_summary CASCADE;
CREATE VIEW public.v_order_summary
  WITH (security_invoker = true)
AS
SELECT
  o.id,
  o.order_number,
  o.customer_name,
  o.customer_phone,
  o.customer_city,
  o.status,
  o.total_amount_mad,
  o.is_paid,
  o.estimated_profit,
  o.real_profit_mad,
  o.created_at,
  o.confirmed_at
FROM orders o;

-- ── 3. v_dashboard_summary ───────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_dashboard_summary CASCADE;
CREATE VIEW public.v_dashboard_summary
  WITH (security_invoker = true)
AS
SELECT
  COUNT(*)                                                          AS total_leads,
  COUNT(*) FILTER (WHERE status IN (
    'confirmed','sent_to_delivery','in_transit','delivered','paid'
  ))                                                                AS confirmed_count,
  COUNT(*) FILTER (WHERE status IN ('delivered','paid'))            AS delivered_count,
  COUNT(*) FILTER (WHERE status = 'returned')                      AS returned_count,
  COUNT(*) FILTER (WHERE status = 'refused')                       AS refused_count,
  COUNT(*) FILTER (WHERE status = 'no_answer')                     AS no_answer_count,
  COALESCE(SUM(total_amount_mad), 0)                               AS estimated_revenue,
  COALESCE(SUM(total_amount_mad) FILTER (WHERE is_paid = true), 0) AS real_revenue,
  COALESCE(SUM(estimated_profit), 0)                               AS estimated_profit,
  COALESCE(SUM(real_profit_mad)  FILTER (WHERE is_paid = true), 0) AS real_profit,
  COALESCE(SUM(cogs_total), 0)                                     AS total_cogs,
  COALESCE(SUM(delivery_cost_real_mad), 0)                         AS total_delivery_cost,
  COALESCE(SUM(return_cost_mad), 0)                                AS total_return_losses,
  COALESCE(SUM(total_amount_mad) FILTER (
    WHERE status IN ('delivered','paid') AND is_paid = false
  ), 0)                                                             AS pending_collection
FROM orders
WHERE status NOT IN ('cancelled');

-- ── 4. v_product_performance ─────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_product_performance CASCADE;
CREATE VIEW public.v_product_performance
  WITH (security_invoker = true)
AS
SELECT
  p.id              AS product_id,
  p.name            AS product_name,
  p.sku,
  p.sale_price_mad,
  p.total_cost_mad,
  p.estimated_profit_mad AS unit_profit,
  p.ads_cost_mad,
  COUNT(o.id) AS lead_count,
  COUNT(o.id) FILTER (WHERE o.status IN (
    'confirmed','sent_to_delivery','in_transit','delivered','paid'
  ))                AS confirmed_count,
  COUNT(o.id) FILTER (WHERE o.status IN ('delivered','paid')) AS delivered_count,
  COUNT(o.id) FILTER (WHERE o.status = 'returned') AS returned_count,
  CASE WHEN COUNT(o.id) > 0
    THEN ROUND(
      COUNT(o.id) FILTER (WHERE o.status IN (
        'confirmed','sent_to_delivery','in_transit','delivered','paid'
      ))::NUMERIC / COUNT(o.id) * 100, 1)
    ELSE 0 END      AS confirmation_rate,
  COALESCE(SUM(o.total_amount_mad), 0) AS total_revenue,
  COALESCE(SUM(o.total_amount_mad) FILTER (WHERE o.is_paid), 0) AS real_revenue,
  COALESCE(SUM(o.estimated_profit), 0) AS estimated_profit,
  COALESCE(SUM(o.real_profit_mad)  FILTER (WHERE o.is_paid), 0) AS real_profit,
  COALESCE(SUM(o.return_cost_mad), 0)  AS return_losses
FROM products p
LEFT JOIN order_items oi ON oi.product_id = p.id
LEFT JOIN orders o       ON o.id = oi.order_id AND o.status NOT IN ('cancelled')
GROUP BY p.id, p.name, p.sku, p.sale_price_mad, p.total_cost_mad,
         p.estimated_profit_mad, p.ads_cost_mad
ORDER BY lead_count DESC;

-- ── 5. v_finance_daily ───────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_finance_daily CASCADE;
CREATE VIEW public.v_finance_daily
  WITH (security_invoker = true)
AS
SELECT
  DATE(o.created_at)  AS day,
  COUNT(*)            AS leads,
  COUNT(*) FILTER (WHERE o.status IN (
    'confirmed','sent_to_delivery','in_transit','delivered','paid'
  ))                  AS confirmed,
  COUNT(*) FILTER (WHERE o.status IN ('delivered','paid')) AS delivered,
  COUNT(*) FILTER (WHERE o.status = 'returned') AS returned,
  COALESCE(SUM(o.total_amount_mad), 0) AS estimated_revenue,
  COALESCE(SUM(o.total_amount_mad) FILTER (WHERE o.is_paid), 0) AS real_revenue,
  COALESCE(SUM(o.estimated_profit), 0) AS estimated_profit,
  COALESCE(SUM(o.real_profit_mad)  FILTER (WHERE o.is_paid), 0) AS real_profit
FROM orders o
WHERE o.status NOT IN ('cancelled')
GROUP BY DATE(o.created_at)
ORDER BY day DESC;

-- ── 6. v_return_loss_summary ─────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_return_loss_summary CASCADE;
CREATE VIEW public.v_return_loss_summary
  WITH (security_invoker = true)
AS
SELECT
  r.id                                 AS return_id,
  r.return_number,
  r.order_id,
  r.status,
  r.condition,
  SUM(ri.returned_qty)                 AS total_returned,
  SUM(ri.good_qty)                     AS total_good,
  SUM(ri.damaged_qty)                  AS total_damaged,
  SUM(ri.missing_qty)                  AS total_missing,
  SUM(ri.restocked_qty)                AS total_restocked,
  SUM(ri.write_off_value)              AS total_write_off_mad,
  r.refund_amount,
  r.carrier_cost,
  (r.refund_amount
    + r.carrier_cost
    + COALESCE(SUM(ri.write_off_value), 0)) AS total_loss_mad,
  r.created_at
FROM returns r
LEFT JOIN return_items ri ON ri.return_id = r.id
GROUP BY r.id, r.return_number, r.order_id, r.status, r.condition,
         r.refund_amount, r.carrier_cost, r.created_at;

-- ── 7. v_agent_performance ───────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_agent_performance CASCADE;
CREATE VIEW public.v_agent_performance
  WITH (security_invoker = true)
AS
SELECT
  u.id             AS agent_id,
  u.full_name,
  u.role,
  s.stat_date,
  s.calls_made,
  s.calls_confirmed,
  s.calls_refused,
  s.calls_no_answer,
  s.orders_confirmed,
  s.revenue_confirmed,
  CASE WHEN s.calls_made = 0 THEN 0
       ELSE ROUND((s.calls_confirmed::NUMERIC / s.calls_made) * 100, 2)
  END              AS confirmation_rate_pct,
  CASE WHEN s.orders_confirmed = 0 THEN NULL
       ELSE ROUND(s.revenue_confirmed / s.orders_confirmed, 2)
  END              AS avg_order_value
FROM agent_daily_stats s
JOIN users u ON u.id = s.agent_id;

-- ── 8. v_roas_by_campaign ────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_roas_by_campaign CASCADE;
CREATE VIEW public.v_roas_by_campaign
  WITH (security_invoker = true)
AS
SELECT
  ac.id            AS campaign_id,
  ac.name          AS campaign_name,
  ac.platform,
  COUNT(o.id)      AS total_orders,
  COALESCE(SUM(o.total_amount_mad), 0)                               AS total_revenue,
  COALESCE(SUM(o.total_amount_mad) FILTER (WHERE o.is_paid), 0)     AS real_revenue,
  COALESCE(SUM(o.real_profit_mad)  FILTER (WHERE o.is_paid), 0)     AS real_profit,
  COALESCE(SUM(ac.daily_budget_mad), 0)                             AS total_spend,
  CASE WHEN COALESCE(SUM(ac.daily_budget_mad), 0) = 0 THEN NULL
       ELSE ROUND(
         COALESCE(SUM(o.total_amount_mad) FILTER (WHERE o.is_paid), 0)
         / SUM(ac.daily_budget_mad), 2)
  END              AS roas
FROM ad_campaigns ac
LEFT JOIN orders o ON o.ad_campaign_id = ac.id AND o.status NOT IN ('cancelled')
GROUP BY ac.id, ac.name, ac.platform;

-- ── 9. v_roas_by_adset ───────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_roas_by_adset CASCADE;
CREATE VIEW public.v_roas_by_adset
  WITH (security_invoker = true)
AS
SELECT
  oas.id           AS adset_id,
  oas.name         AS adset_name,
  ac.id            AS campaign_id,
  ac.name          AS campaign_name,
  COUNT(o.id)      AS total_orders,
  COALESCE(SUM(o.total_amount_mad), 0)                               AS total_revenue,
  COALESCE(SUM(o.total_amount_mad) FILTER (WHERE o.is_paid), 0)     AS real_revenue,
  COALESCE(SUM(o.real_profit_mad)  FILTER (WHERE o.is_paid), 0)     AS real_profit,
  COALESCE(SUM(oas.daily_budget_mad), 0)                            AS total_spend,
  CASE WHEN COALESCE(SUM(oas.daily_budget_mad), 0) = 0 THEN NULL
       ELSE ROUND(
         COALESCE(SUM(o.total_amount_mad) FILTER (WHERE o.is_paid), 0)
         / SUM(oas.daily_budget_mad), 2)
  END              AS roas
FROM ad_adsets oas
JOIN ad_campaigns ac ON ac.id = oas.campaign_id
LEFT JOIN orders o ON o.ad_adset_id = oas.id AND o.status NOT IN ('cancelled')
GROUP BY oas.id, oas.name, ac.id, ac.name;

-- ── Grant SELECT to authenticated users ──────────────────────────────────────
-- RLS on the underlying tables still applies when security_invoker = true
GRANT SELECT ON public.v_stock_summary       TO authenticated;
GRANT SELECT ON public.v_order_summary       TO authenticated;
GRANT SELECT ON public.v_dashboard_summary   TO authenticated;
GRANT SELECT ON public.v_product_performance TO authenticated;
GRANT SELECT ON public.v_finance_daily       TO authenticated;
GRANT SELECT ON public.v_return_loss_summary TO authenticated;
GRANT SELECT ON public.v_agent_performance   TO authenticated;
GRANT SELECT ON public.v_roas_by_campaign    TO authenticated;
GRANT SELECT ON public.v_roas_by_adset       TO authenticated;
