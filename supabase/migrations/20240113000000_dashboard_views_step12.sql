-- =============================================================================
-- MIGRATION: Dashboard Views + Finance Brain — Step 12
-- =============================================================================

-- ── 1. Summary dashboard view ─────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_dashboard_summary AS
SELECT
  -- Lead funnel
  COUNT(*)                                                         AS total_leads,
  COUNT(*) FILTER (WHERE status IN (
    'confirmed','sent_to_delivery','in_transit','delivered','paid'
  ))                                                               AS confirmed_count,
  COUNT(*) FILTER (WHERE status IN ('delivered','paid'))           AS delivered_count,
  COUNT(*) FILTER (WHERE status = 'returned')                     AS returned_count,
  COUNT(*) FILTER (WHERE status = 'refused')                      AS refused_count,
  COUNT(*) FILTER (WHERE status = 'no_answer')                    AS no_answer_count,
  COUNT(*) FILTER (WHERE status = 'cancelled')                    AS cancelled_count,

  -- Revenue
  COALESCE(SUM(total_amount_mad), 0)                              AS estimated_revenue,
  COALESCE(SUM(total_amount_mad) FILTER (WHERE is_paid = true), 0) AS real_revenue,

  -- Profit
  COALESCE(SUM(estimated_profit_mad), 0)                          AS estimated_profit,
  COALESCE(SUM(real_profit_mad) FILTER (WHERE is_paid = true), 0) AS real_profit,

  -- Costs
  COALESCE(SUM(cogs_total), 0)                                    AS total_cogs,
  COALESCE(SUM(delivery_cost_real_mad), 0)                        AS total_delivery_cost,
  COALESCE(SUM(return_cost_mad), 0)                               AS total_return_losses,

  -- Pending collection
  COALESCE(SUM(total_amount_mad) FILTER (
    WHERE status IN ('delivered','paid') AND is_paid = false
  ), 0)                                                            AS pending_collection

FROM orders
WHERE status NOT IN ('cancelled');

-- ── 2. Product performance view ───────────────────────────────────────────────
CREATE OR REPLACE VIEW v_product_performance AS
SELECT
  p.id                                                             AS product_id,
  p.name                                                           AS product_name,
  p.sku,
  p.sale_price_mad,
  p.total_cost_mad,
  p.estimated_profit_mad                                           AS unit_profit,
  p.ads_cost_mad,
  p.packaging_cost_mad,
  p.confirmation_cost_mad,
  p.shipping_cost_mad,

  -- Counts
  COUNT(o.id)                                                      AS lead_count,
  COUNT(o.id) FILTER (WHERE o.status IN (
    'confirmed','sent_to_delivery','in_transit','delivered','paid'
  ))                                                               AS confirmed_count,
  COUNT(o.id) FILTER (WHERE o.status IN ('delivered','paid'))      AS delivered_count,
  COUNT(o.id) FILTER (WHERE o.status = 'returned')                AS returned_count,

  -- Rates (safe division)
  CASE WHEN COUNT(o.id) > 0
    THEN ROUND(COUNT(o.id) FILTER (WHERE o.status IN (
      'confirmed','sent_to_delivery','in_transit','delivered','paid'
    ))::NUMERIC / COUNT(o.id) * 100, 1)
    ELSE 0 END                                                      AS confirmation_rate,

  CASE WHEN COUNT(o.id) FILTER (WHERE o.status IN (
    'confirmed','sent_to_delivery','in_transit','delivered','paid'
  )) > 0
    THEN ROUND(COUNT(o.id) FILTER (WHERE o.status IN ('delivered','paid'))::NUMERIC /
      COUNT(o.id) FILTER (WHERE o.status IN (
        'confirmed','sent_to_delivery','in_transit','delivered','paid'
      )) * 100, 1)
    ELSE 0 END                                                      AS delivery_rate,

  -- Revenue & profit
  COALESCE(SUM(o.total_amount_mad), 0)                            AS total_revenue,
  COALESCE(SUM(o.total_amount_mad) FILTER (WHERE o.is_paid), 0)  AS real_revenue,
  COALESCE(SUM(o.estimated_profit_mad), 0)                        AS estimated_profit,
  COALESCE(SUM(o.real_profit_mad) FILTER (WHERE o.is_paid), 0)   AS real_profit,
  COALESCE(SUM(o.cogs_total), 0)                                  AS total_cogs,
  COALESCE(SUM(o.delivery_cost_real_mad), 0)                      AS total_delivery_cost,
  COALESCE(SUM(o.return_cost_mad), 0)                             AS return_losses,

  -- Margin %
  CASE WHEN COALESCE(SUM(o.total_amount_mad) FILTER (WHERE o.is_paid), 0) > 0
    THEN ROUND(COALESCE(SUM(o.real_profit_mad) FILTER (WHERE o.is_paid), 0) /
      SUM(o.total_amount_mad) FILTER (WHERE o.is_paid) * 100, 1)
    ELSE 0 END                                                      AS real_margin_pct,

  -- Status classification
  CASE
    WHEN COUNT(o.id) = 0 THEN 'no_data'
    WHEN COALESCE(SUM(o.real_profit_mad) FILTER (WHERE o.is_paid), 0) > 0
      AND ROUND(COALESCE(SUM(o.real_profit_mad) FILTER (WHERE o.is_paid), 0) /
        NULLIF(SUM(o.total_amount_mad) FILTER (WHERE o.is_paid), 0) * 100, 1) >= 15
    THEN 'profitable'
    WHEN COALESCE(SUM(o.real_profit_mad) FILTER (WHERE o.is_paid), 0) < 0
    THEN 'losing'
    ELSE 'needs_review'
  END                                                               AS performance_status

FROM products p
LEFT JOIN order_items oi ON oi.product_id = p.id
LEFT JOIN orders o ON o.id = oi.order_id AND o.status NOT IN ('cancelled')
GROUP BY p.id, p.name, p.sku, p.sale_price_mad, p.total_cost_mad,
  p.estimated_profit_mad, p.ads_cost_mad, p.packaging_cost_mad,
  p.confirmation_cost_mad, p.shipping_cost_mad
ORDER BY lead_count DESC;

-- ── 3. Finance daily view ─────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_finance_daily AS
SELECT
  DATE(o.created_at)                                               AS day,
  COUNT(*)                                                         AS leads,
  COUNT(*) FILTER (WHERE o.status IN (
    'confirmed','sent_to_delivery','in_transit','delivered','paid'
  ))                                                               AS confirmed,
  COUNT(*) FILTER (WHERE o.status IN ('delivered','paid'))         AS delivered,
  COUNT(*) FILTER (WHERE o.status = 'returned')                   AS returned,
  COALESCE(SUM(o.total_amount_mad), 0)                            AS estimated_revenue,
  COALESCE(SUM(o.total_amount_mad) FILTER (WHERE o.is_paid), 0)  AS real_revenue,
  COALESCE(SUM(o.estimated_profit_mad), 0)                        AS estimated_profit,
  COALESCE(SUM(o.real_profit_mad) FILTER (WHERE o.is_paid), 0)   AS real_profit
FROM orders o
WHERE o.status NOT IN ('cancelled')
GROUP BY DATE(o.created_at)
ORDER BY day DESC;

-- ── 4. Delivery claims view ───────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_delivery_claims AS
SELECT
  o.id,
  o.order_number,
  o.customer_name,
  o.customer_phone,
  o.delivery_tracking_number,
  o.total_amount_mad,
  o.status,
  o.is_paid,
  o.return_cost_mad,
  o.delivery_cost_real_mad,
  o.updated_at,
  -- Amount to claim from delivery company
  CASE
    WHEN o.status IN ('delivered','paid') AND o.is_paid = false
    THEN o.total_amount_mad
    WHEN o.status = 'returned'
    THEN o.return_cost_mad
    ELSE 0
  END                                                               AS claim_amount,
  CASE
    WHEN o.status IN ('delivered','paid') AND o.is_paid = false THEN 'pending_collection'
    WHEN o.status = 'returned' THEN 'return_claim'
    ELSE 'other'
  END                                                               AS claim_type
FROM orders o
WHERE o.status IN ('delivered','paid','returned')
  AND (
    (o.status IN ('delivered','paid') AND o.is_paid = false)
    OR o.status = 'returned'
  )
ORDER BY o.updated_at DESC;

-- ── Indexes for performance ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_status_paid   ON orders(status, is_paid);
CREATE INDEX IF NOT EXISTS idx_orders_created_date  ON orders(DATE(created_at));
CREATE INDEX IF NOT EXISTS idx_order_items_product  ON order_items(product_id);

-- ── RLS: views inherit parent table RLS ───────────────────────────────────────
-- Views are readable by authenticated users — API enforces role-check server-side
