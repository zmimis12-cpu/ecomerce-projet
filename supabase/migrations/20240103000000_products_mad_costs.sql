-- =============================================================================
-- MIGRATION: Products — MAD cost fields + product_images table
-- Step 3 — Products module
-- Adds MAD-denominated cost fields to existing products table.
-- All ADD COLUMN use IF NOT EXISTS (idempotent).
-- Does NOT remove existing USD fields.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Add MAD cost fields to products
-- -----------------------------------------------------------------------------
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS slug                    TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS sale_price_mad          NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchase_price_mad      NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS packaging_cost_mad      NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS confirmation_cost_mad   NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_cost_mad       NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ads_cost_mad            NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_costs_mad         NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Computed fields (plain columns updated by trigger — generated columns can't
-- reference other generated columns in older PG, so we use a trigger instead)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS total_cost_mad          NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estimated_profit_mad    NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_profitable_price    NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS margin_pct              NUMERIC(6,2)  NOT NULL DEFAULT 0;

-- Slug index
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);

-- -----------------------------------------------------------------------------
-- 2. Trigger: auto-compute cost totals on INSERT / UPDATE
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION compute_product_costs()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_total NUMERIC(12,2);
BEGIN
  v_total :=
    COALESCE(NEW.purchase_price_mad, 0) +
    COALESCE(NEW.packaging_cost_mad, 0) +
    COALESCE(NEW.confirmation_cost_mad, 0) +
    COALESCE(NEW.shipping_cost_mad, 0) +
    COALESCE(NEW.ads_cost_mad, 0) +
    COALESCE(NEW.other_costs_mad, 0);

  NEW.total_cost_mad        := v_total;
  NEW.min_profitable_price  := v_total;
  NEW.estimated_profit_mad  := COALESCE(NEW.sale_price_mad, 0) - v_total;
  NEW.margin_pct            := CASE
    WHEN COALESCE(NEW.sale_price_mad, 0) = 0 THEN 0
    ELSE ROUND(
      ((COALESCE(NEW.sale_price_mad, 0) - v_total) / COALESCE(NEW.sale_price_mad, 0)) * 100,
      2
    )
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compute_product_costs ON products;
CREATE TRIGGER trg_compute_product_costs
  BEFORE INSERT OR UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION compute_product_costs();

-- -----------------------------------------------------------------------------
-- 3. product_images table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_images (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id   UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,           -- path in Supabase Storage bucket
  public_url   TEXT NOT NULL,           -- full public URL for display
  is_primary   BOOLEAN NOT NULL DEFAULT false,
  display_order INT NOT NULL DEFAULT 0,
  file_name    TEXT,
  file_size    INT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_images_product   ON product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_product_images_primary   ON product_images(product_id) WHERE is_primary = true;

-- Only one primary image per product
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_primary_image
  ON product_images(product_id)
  WHERE is_primary = true;

-- -----------------------------------------------------------------------------
-- 4. RLS on products and product_images
-- -----------------------------------------------------------------------------
ALTER TABLE products       ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;

-- Products: authenticated users can read
CREATE POLICY IF NOT EXISTS "products_select_authenticated"
  ON products FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Products: only admin/manager/super_admin can mutate
CREATE POLICY IF NOT EXISTS "products_insert_managers"
  ON products FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND role IN ('super_admin', 'admin', 'manager')
        AND is_active = true
    )
  );

CREATE POLICY IF NOT EXISTS "products_update_managers"
  ON products FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND role IN ('super_admin', 'admin', 'manager')
        AND is_active = true
    )
  );

CREATE POLICY IF NOT EXISTS "products_delete_managers"
  ON products FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND role IN ('super_admin', 'admin', 'manager')
        AND is_active = true
    )
  );

-- product_images: same pattern
CREATE POLICY IF NOT EXISTS "product_images_select_authenticated"
  ON product_images FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY IF NOT EXISTS "product_images_mutate_managers"
  ON product_images FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND role IN ('super_admin', 'admin', 'manager')
        AND is_active = true
    )
  );

-- =============================================================================
-- STORAGE SETUP (run manually in Supabase Dashboard)
-- =============================================================================
-- 1. Dashboard → Storage → New bucket
--    Name: product-images
--    Public: YES
--    Allowed MIME: image/jpeg, image/png, image/webp, image/avif
--    Max size: 5MB
--
-- 2. Storage → product-images → Policies → Add policy
--    SELECT: authenticated users (public read)
--    INSERT/UPDATE/DELETE: role IN ('super_admin','admin','manager')
-- =============================================================================
