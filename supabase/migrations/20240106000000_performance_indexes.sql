-- =============================================================================
-- MIGRATION: Performance indexes
-- Safe to run — all use IF NOT EXISTS
-- =============================================================================

-- orders
CREATE INDEX IF NOT EXISTS idx_perf_orders_created_at     ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_perf_orders_status         ON orders(status);
CREATE INDEX IF NOT EXISTS idx_perf_orders_customer_phone ON orders(customer_phone);
CREATE INDEX IF NOT EXISTS idx_perf_orders_order_number   ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_perf_orders_assigned_to    ON orders(assigned_to);
CREATE INDEX IF NOT EXISTS idx_perf_orders_is_duplicate   ON orders(is_duplicate) WHERE is_duplicate = true;

-- Composite: most common list query pattern
CREATE INDEX IF NOT EXISTS idx_perf_orders_list
  ON orders(created_at DESC, status, assigned_to);

-- order_items
CREATE INDEX IF NOT EXISTS idx_perf_order_items_order_id   ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_perf_order_items_product_id ON order_items(product_id);

-- products
CREATE INDEX IF NOT EXISTS idx_perf_products_sku       ON products(sku);
CREATE INDEX IF NOT EXISTS idx_perf_products_slug      ON products(slug);
CREATE INDEX IF NOT EXISTS idx_perf_products_is_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_perf_products_created   ON products(created_at DESC);

-- Composite: active products list
CREATE INDEX IF NOT EXISTS idx_perf_products_active_list
  ON products(is_active, created_at DESC);

-- product_images
CREATE INDEX IF NOT EXISTS idx_perf_product_images_product_id ON product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_perf_product_images_primary
  ON product_images(product_id, is_primary) WHERE is_primary = true;

-- order_status_history
CREATE INDEX IF NOT EXISTS idx_perf_order_history_order ON order_status_history(order_id, created_at DESC);

-- users lookup (used in auth + agent queries)
CREATE INDEX IF NOT EXISTS idx_perf_users_role_active ON users(role, is_active);
