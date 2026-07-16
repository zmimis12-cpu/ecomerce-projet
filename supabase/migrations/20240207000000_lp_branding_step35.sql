-- ── Migration: image hero + branding (logo/nom boutique) sur landing_pages ──
ALTER TABLE landing_pages
  ADD COLUMN IF NOT EXISTS hero_image  TEXT,
  ADD COLUMN IF NOT EXISTS store_logo_url TEXT,
  ADD COLUMN IF NOT EXISTS store_name  TEXT;
