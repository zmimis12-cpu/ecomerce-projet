-- ── Migration: Éditeurs vidéo + créatives + attribution des commandes ────────
-- Chaque vidéo (créative) a un code unique (V001, V002…). Le code est mis dans
-- le lien de la pub : https://hajtek.ma/lp/<slug>?cr=V001
-- La LP le récupère et l'envoie avec la commande → on sait quelle vidéo a
-- généré quelle commande, donc quel éditeur est payé pour chaque livraison.

-- 1. Nouveau rôle
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'video_editor';

-- 2. Rémunération par éditeur
CREATE TABLE IF NOT EXISTS video_editor_settings (
  user_id          UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  commission_type  TEXT NOT NULL DEFAULT 'fixed' CHECK (commission_type IN ('fixed','percent')),
  commission_value NUMERIC(10,2) NOT NULL DEFAULT 5,   -- MAD par livrée, ou % du montant
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Créatives (vidéos)
CREATE SEQUENCE IF NOT EXISTS creative_code_seq START 1;

CREATE TABLE IF NOT EXISTS creatives (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        TEXT NOT NULL UNIQUE
              DEFAULT ('V' || LPAD(nextval('creative_code_seq')::TEXT, 3, '0')),
  editor_id   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  product_id  UUID REFERENCES products(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  video_url   TEXT,
  platform    TEXT NOT NULL DEFAULT 'meta' CHECK (platform IN ('meta','tiktok','other')),
  status      TEXT NOT NULL DEFAULT 'in_ads' CHECK (status IN ('draft','in_ads','paused')),
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_creatives_editor  ON creatives(editor_id);
CREATE INDEX IF NOT EXISTS idx_creatives_product ON creatives(product_id);

-- 4. Attribution sur les commandes
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS creative_id   UUID REFERENCES creatives(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS creative_code TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_creative ON orders(creative_id) WHERE creative_id IS NOT NULL;

-- 5. RLS : accès uniquement côté serveur (service role). Aucune policy publique.
ALTER TABLE video_editor_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE creatives             ENABLE ROW LEVEL SECURITY;
