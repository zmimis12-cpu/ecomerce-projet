-- =============================================================================
-- MIGRATION: Dashboard Views + Finance Brain — Step 12 (fixed)
-- =============================================================================

DROP VIEW IF EXISTS v_delivery_claims;
DROP VIEW IF EXISTS v_finance_daily;
DROP VIEW IF EXISTS v_product_performance;
DROP VIEW IF EXISTS v_dashboard_summary;

CREATE OR REPLACE VIEW v_dashboard_summary AS
SELECT
  COUNT(*)                                                         AS total_leads,
  COUNT(*) FILTER (WHERE status IN (
    'confirmed','sent_to_delivery','in_transit','delivered','paid'
  ))                                                               AS confirmed_count,
  COUNT(*) FILTER (WHERE status IN ('delivered','paid'))           AS delivered_count,
  COUNT(*) FILTER (WHERE status = 'returned')                     AS returned_count,
  COUNT(*) FILTER (WHERE status = 'refused')                      AS refused_count,
  COUNT(*) FILTER (WHERE status = 'no_answer')                    AS no_answer_count,
  COALESCE(SUM(total_amount_mad), 0)                              AS estimated_revenue,
  COALESCE(SUM(total_amount_mad) FILTER (WHERE is_paid = true), 0) AS real_revenue,
  COALESCE(SUM(estimated_profit), 0)                              AS estimated_profit,
  COALESCE(SUM(real_profit_mad) FILTER (WHERE is_paid = true), 0) AS real_profit,
  COALESCE(SUM(cogs_total), 0)                                    AS total_cogs,
  COALESCE(SUM(delivery_cost_real_mad), 0)                        AS total_delivery_cost,
  COALESCE(SUM(return_cost_mad), 0)                               AS total_return_losses,
  COALESCE(SUM(total_amount_mad) FILTER (
    WHERE status IN ('delivered','paid') AND is_paid = false
  ), 0)                                                            AS pending_collection
FROM orders
WHERE status NOT IN ('cancelled');

CREATE OR REPLACE VIEW v_product_performance AS
SELECT
  p.id AS product_id, p.name AS product_name, p.sku,
  p.sale_price_mad, p.total_cost_mad,
  p.estimated_profit_mad AS unit_profit, p.ads_cost_mad,
  COUNT(o.id) AS lead_count,
  COUNT(o.id) FILTER (WHERE o.status IN (
    'confirmed','sent_to_delivery','in_transit','delivered','paid'
  )) AS confirmed_count,
  COUNT(o.id) FILTER (WHERE o.status IN ('delivered','paid')) AS delivered_count,
  COUNT(o.id) FILTER (WHERE o.status = 'returned') AS returned_count,
  CASE WHEN COUNT(o.id) > 0
    THEN ROUND(COUNT(o.id) FILTER (WHERE o.status IN (
      'confirmed','sent_to_delivery','in_transit','delivered','paid'
    ))::NUMERIC / COUNT(o.id) * 100, 1)
    ELSE 0 END AS confirmation_rate,
  COALESCE(SUM(o.total_amount_mad), 0) AS total_revenue,
  COALESCE(SUM(o.total_amount_mad) FILTER (WHERE o.is_paid), 0) AS real_revenue,
  COALESCE(SUM(o.estimated_profit), 0) AS estimated_profit,
  COALESCE(SUM(o.real_profit_mad) FILTER (WHERE o.is_paid), 0) AS real_profit,
  COALESCE(SUM(o.return_cost_mad), 0) AS return_losses
FROM products p
LEFT JOIN order_items oi ON oi.product_id = p.id
LEFT JOIN orders o ON o.id = oi.order_id AND o.status NOT IN ('cancelled')
GROUP BY p.id, p.name, p.sku, p.sale_price_mad, p.total_cost_mad,
  p.estimated_profit_mad, p.ads_cost_mad
ORDER BY lead_count DESC;

CREATE OR REPLACE VIEW v_finance_daily AS
SELECT
  DATE(o.created_at) AS day,
  COUNT(*) AS leads,
  COUNT(*) FILTER (WHERE o.status IN (
    'confirmed','sent_to_delivery','in_transit','delivered','paid'
  )) AS confirmed,
  COUNT(*) FILTER (WHERE o.status IN ('delivered','paid')) AS delivered,
  COUNT(*) FILTER (WHERE o.status = 'returned') AS returned,
  COALESCE(SUM(o.total_amount_mad), 0) AS estimated_revenue,
  COALESCE(SUM(o.total_amount_mad) FILTER (WHERE o.is_paid), 0) AS real_revenue,
  COALESCE(SUM(o.estimated_profit), 0) AS estimated_profit,
  COALESCE(SUM(o.real_profit_mad) FILTER (WHERE o.is_paid), 0) AS real_profit
FROM orders o
WHERE o.status NOT IN ('cancelled')
GROUP BY DATE(o.created_at)
ORDER BY day DESC;

-- Indexes — no DATE() function (not immutable)
CREATE INDEX IF NOT EXISTS idx_orders_status_paid  ON orders(status, is_paid);
CREATE INDEX IF NOT EXISTS idx_orders_created_at   ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);
