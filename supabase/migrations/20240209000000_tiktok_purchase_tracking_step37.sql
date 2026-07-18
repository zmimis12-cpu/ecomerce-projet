-- ── Migration: tracking TikTok Events API (CompletePayment server-side) ─────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS tiktok_pixel_id      TEXT,
  ADD COLUMN IF NOT EXISTS tiktok_ttp           TEXT,   -- cookie _ttp (équivalent fbp)
  ADD COLUMN IF NOT EXISTS tiktok_ttclid        TEXT,   -- click ID (équivalent fbc)
  ADD COLUMN IF NOT EXISTS tiktok_client_ip     TEXT,
  ADD COLUMN IF NOT EXISTS tiktok_client_ua     TEXT,
  ADD COLUMN IF NOT EXISTS tiktok_purchase_sent BOOLEAN NOT NULL DEFAULT false;
