-- ── Lanceur de campagne Meta depuis GestionPro ───────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_launches (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             TEXT NOT NULL,
  product_id       UUID REFERENCES products(id) ON DELETE SET NULL,
  daily_budget_usd NUMERIC(10,2) NOT NULL DEFAULT 20,
  age_min          INTEGER NOT NULL DEFAULT 18,
  age_max          INTEGER NOT NULL DEFAULT 65,
  status           TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','creating','waiting_media','ready','active','error')),
  meta_campaign_id TEXT,
  meta_adset_id    TEXT,
  error            TEXT,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaign_launch_items (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  launch_id        UUID NOT NULL REFERENCES campaign_launches(id) ON DELETE CASCADE,
  creative_id      UUID REFERENCES creatives(id) ON DELETE SET NULL,   -- vidéo d'éditeur (code V00X)
  media_type       TEXT NOT NULL CHECK (media_type IN ('video','image')),
  media_path       TEXT NOT NULL,          -- fichier dans le bucket ad-media
  primary_text     TEXT NOT NULL,
  headline         TEXT NOT NULL,
  cta              TEXT NOT NULL DEFAULT 'ORDER_NOW',
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','uploading','processing','created','error')),
  meta_video_id    TEXT,
  meta_image_hash  TEXT,
  meta_creative_id TEXT,
  meta_ad_id       TEXT,
  error            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_launch_items_launch ON campaign_launch_items(launch_id);

ALTER TABLE campaign_launches     ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_launch_items ENABLE ROW LEVEL SECURITY;

-- Fichiers des pubs : lecture publique (Meta doit pouvoir les télécharger)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('ad-media', 'ad-media', true, 524288000)
ON CONFLICT (id) DO NOTHING;
