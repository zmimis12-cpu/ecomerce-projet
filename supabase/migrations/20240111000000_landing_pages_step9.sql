-- =============================================================================
-- MIGRATION: Landing Pages + Order Intake — Step 9
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Orders — add landing page tracking fields
-- -----------------------------------------------------------------------------
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS landing_page_slug  TEXT,
  ADD COLUMN IF NOT EXISTS ip_hash            TEXT,   -- hashed IP for rate limiting
  ADD COLUMN IF NOT EXISTS user_agent         TEXT;

-- source already exists (import_source) — we use source column from v1

-- -----------------------------------------------------------------------------
-- 2. landing_pages table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS landing_pages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  slug            TEXT UNIQUE NOT NULL,
  title           TEXT NOT NULL,
  subtitle        TEXT,
  description     TEXT,
  offer_text      TEXT,                        -- e.g. "عرض محدود"
  is_active       BOOLEAN NOT NULL DEFAULT true,
  meta_pixel_id   TEXT,
  tiktok_pixel_id TEXT,
  view_count      INT NOT NULL DEFAULT 0,
  order_count     INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lp_slug      ON landing_pages(slug);
CREATE INDEX IF NOT EXISTS idx_lp_product   ON landing_pages(product_id);
CREATE INDEX IF NOT EXISTS idx_lp_is_active ON landing_pages(is_active);

ALTER TABLE landing_pages ENABLE ROW LEVEL SECURITY;

-- Public can read active landing pages (via API — anon key)
CREATE POLICY "lp_public_read" ON landing_pages
  FOR SELECT USING (is_active = true);

-- Only authenticated admin can manage
CREATE POLICY "lp_admin_write" ON landing_pages
  FOR ALL USING (auth.uid() IS NOT NULL);

-- -----------------------------------------------------------------------------
-- 3. Rate limit table (IP-based, server-side)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_rate_limits (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ip_hash     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orl_ip_hash  ON order_rate_limits(ip_hash);
CREATE INDEX IF NOT EXISTS idx_orl_created  ON order_rate_limits(created_at DESC);

ALTER TABLE order_rate_limits ENABLE ROW LEVEL SECURITY;
-- No public access — managed only via service role in API route

-- Auto-clean old rate limit entries (> 1 hour)
CREATE OR REPLACE FUNCTION cleanup_rate_limits()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM order_rate_limits WHERE created_at < NOW() - INTERVAL '1 hour';
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Increment landing page view/order count
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION increment_lp_views(p_slug TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE landing_pages SET view_count = view_count + 1 WHERE slug = p_slug;
END;
$$;

CREATE OR REPLACE FUNCTION increment_lp_orders(p_slug TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE landing_pages SET order_count = order_count + 1 WHERE slug = p_slug;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. Indexes on orders for landing page queries
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_orders_landing_slug ON orders(landing_page_slug);
CREATE INDEX IF NOT EXISTS idx_orders_ip_hash      ON orders(ip_hash);
