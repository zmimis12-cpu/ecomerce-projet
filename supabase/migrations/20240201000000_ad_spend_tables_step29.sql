-- ── Migration: Ad spend infrastructure (Meta/TikTok/Google) ─────────────────
-- lib/ads/actions.ts référence 3 tables qui n'ont JAMAIS été créées par une
-- migration (ad_platform_settings, campaign_product_assignments,
-- product_ad_spend) — le sync Meta Ads échouait donc silencieusement depuis
-- le début. On les crée ici (IF NOT EXISTS, sans danger si elles existent déjà
-- côté Supabase). On ajoute aussi manual_ad_spend pour TikTok/Google (pas
-- d'API connectée pour l'instant → saisie manuelle du total dépensé).

-- 1. Paramètres de connexion par plateforme (meta/google/tiktok)
CREATE TABLE IF NOT EXISTS ad_platform_settings (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform          TEXT NOT NULL UNIQUE,   -- 'meta' | 'google' | 'tiktok'
  access_token      TEXT NOT NULL DEFAULT '',
  account_id        TEXT NOT NULL DEFAULT '',
  is_active         BOOLEAN NOT NULL DEFAULT false,
  last_sync_at      TIMESTAMPTZ,
  last_sync_status  TEXT,
  last_sync_error   TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE ad_platform_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "aps_auth" ON ad_platform_settings;
CREATE POLICY "aps_auth" ON ad_platform_settings FOR ALL USING (auth.uid() IS NOT NULL);

-- 2. Association manuelle campagne Meta → produit (fallback si le matching SKU échoue)
CREATE TABLE IF NOT EXISTS campaign_product_assignments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform        TEXT NOT NULL,
  campaign_id     TEXT NOT NULL,
  campaign_name   TEXT,
  product_id      UUID REFERENCES products(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (platform, campaign_id)
);
ALTER TABLE campaign_product_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cpa_auth" ON campaign_product_assignments;
CREATE POLICY "cpa_auth" ON campaign_product_assignments FOR ALL USING (auth.uid() IS NOT NULL);

-- 3. Dépense pub réelle par produit (rempli par syncMetaAdSpend, une ligne par produit+période)
CREATE TABLE IF NOT EXISTS product_ad_spend (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id              UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  platform                TEXT NOT NULL,          -- 'meta' | 'google' | 'tiktok'
  matched_campaign_names  TEXT[] NOT NULL DEFAULT '{}',
  spend_mad               NUMERIC(12,2) NOT NULL DEFAULT 0,
  period_start            DATE NOT NULL,
  period_end              DATE NOT NULL,
  synced_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pas_product ON product_ad_spend(product_id);
CREATE INDEX IF NOT EXISTS idx_pas_platform ON product_ad_spend(platform);
CREATE INDEX IF NOT EXISTS idx_pas_period ON product_ad_spend(period_start, period_end);
ALTER TABLE product_ad_spend ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pas_auth" ON product_ad_spend;
CREATE POLICY "pas_auth" ON product_ad_spend FOR ALL USING (auth.uid() IS NOT NULL);

-- 4. Saisie manuelle de dépense pub (TikTok/Google/autre — pas d'API connectée) :
--    montant global sur une période, sans matching produit (trop de travail
--    pour peu de volume au départ). Compté globalement dans "Profit Réel Net Pub".
CREATE TABLE IF NOT EXISTS manual_ad_spend (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform      TEXT NOT NULL,             -- 'tiktok' | 'google' | 'meta' | 'other'
  amount_mad    NUMERIC(12,2) NOT NULL,
  spend_date    DATE NOT NULL,
  note          TEXT,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mas_date ON manual_ad_spend(spend_date);
CREATE INDEX IF NOT EXISTS idx_mas_platform ON manual_ad_spend(platform);
ALTER TABLE manual_ad_spend ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mas_auth" ON manual_ad_spend;
CREATE POLICY "mas_auth" ON manual_ad_spend FOR ALL USING (auth.uid() IS NOT NULL);
