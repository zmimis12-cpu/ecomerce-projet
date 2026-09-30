-- ── Migration: synchro automatique Digylog + Ads + stats vidéos ──────────────

-- 1. Infos Digylog affichées comme sur leur panel
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_driver_phone TEXT,
  ADD COLUMN IF NOT EXISTS delivery_reported_to  TIMESTAMPTZ;

-- 2. Stats par pub et par jour (Meta / TikTok) — rafraîchies automatiquement
CREATE TABLE IF NOT EXISTS ad_insights_daily (
  platform      TEXT NOT NULL CHECK (platform IN ('meta','tiktok')),
  ad_id         TEXT NOT NULL,
  day           DATE NOT NULL,
  ad_name       TEXT,
  campaign_id   TEXT,
  campaign_name TEXT,
  impressions   INTEGER NOT NULL DEFAULT 0,
  clicks        INTEGER NOT NULL DEFAULT 0,
  link_clicks   INTEGER NOT NULL DEFAULT 0,
  leads         INTEGER NOT NULL DEFAULT 0,   -- commandes (Lead pixel / conversions)
  messages      INTEGER NOT NULL DEFAULT 0,   -- conversations WhatsApp/Messenger
  spend_mad     NUMERIC(12,2) NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (platform, ad_id, day)
);
CREATE INDEX IF NOT EXISTS idx_aid_day ON ad_insights_daily(day);

-- 3. Lien pub ↔ vidéo (auto par code "V001" dans le nom de la pub, ou manuel)
CREATE TABLE IF NOT EXISTS creative_ads (
  platform    TEXT NOT NULL,
  ad_id       TEXT NOT NULL,
  creative_id UUID NOT NULL REFERENCES creatives(id) ON DELETE CASCADE,
  linked_by   TEXT NOT NULL DEFAULT 'auto' CHECK (linked_by IN ('auto','manual')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (platform, ad_id)
);
CREATE INDEX IF NOT EXISTS idx_creative_ads_creative ON creative_ads(creative_id);

ALTER TABLE ad_insights_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE creative_ads      ENABLE ROW LEVEL SECURITY;

-- 4. Journal des synchros automatiques (pour savoir quand ça a tourné)
CREATE TABLE IF NOT EXISTS auto_sync_runs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_ms INTEGER,
  result      JSONB
);
ALTER TABLE auto_sync_runs ENABLE ROW LEVEL SECURITY;
