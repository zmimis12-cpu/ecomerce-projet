-- ── Stats pubs détaillées pour les éditeurs (tout sauf l'argent) ─────────────
ALTER TABLE ad_insights_daily
  ADD COLUMN IF NOT EXISTS landing_page_views INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS initiate_checkouts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_plays        INTEGER NOT NULL DEFAULT 0,  -- vues 3 s
  ADD COLUMN IF NOT EXISTS thruplays          INTEGER NOT NULL DEFAULT 0;  -- vues 15 s / complètes

-- Infos "cumul" par pub (portée, fréquence, classements Meta, statut de diffusion)
CREATE TABLE IF NOT EXISTS ad_meta (
  platform                 TEXT NOT NULL,
  ad_id                    TEXT NOT NULL,
  ad_name                  TEXT,
  adset_name               TEXT,
  campaign_name            TEXT,
  effective_status         TEXT,
  quality_ranking          TEXT,
  engagement_rate_ranking  TEXT,
  conversion_rate_ranking  TEXT,
  reach                    INTEGER,
  frequency                NUMERIC(8,2),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (platform, ad_id)
);
ALTER TABLE ad_meta ENABLE ROW LEVEL SECURITY;
