-- =============================================================================
-- MIGRATION: AI Landing Page Builder — Step 10
-- Extends landing_pages with sections JSONB, templates, AI fields.
-- =============================================================================

ALTER TABLE landing_pages
  ADD COLUMN IF NOT EXISTS hero_headline       TEXT,
  ADD COLUMN IF NOT EXISTS hero_subheadline    TEXT,
  ADD COLUMN IF NOT EXISTS price_text          TEXT,
  ADD COLUMN IF NOT EXISTS old_price_text      TEXT,
  ADD COLUMN IF NOT EXISTS stock_text          TEXT,
  ADD COLUMN IF NOT EXISTS cta_text            TEXT DEFAULT 'اطلب الآن',
  ADD COLUMN IF NOT EXISTS whatsapp_number     TEXT,
  ADD COLUMN IF NOT EXISTS template_key        TEXT DEFAULT 'gadget_viral',
  ADD COLUMN IF NOT EXISTS sections            JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_generated        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bundle_1_price      NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS bundle_2_price      NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS bundle_3_price      NUMERIC(12,2);

CREATE INDEX IF NOT EXISTS idx_lp_template ON landing_pages(template_key);
CREATE INDEX IF NOT EXISTS idx_lp_ai       ON landing_pages(ai_generated);

-- Add ai_analysis JSONB field (Step 10 upgrade)
ALTER TABLE landing_pages
  ADD COLUMN IF NOT EXISTS ai_analysis JSONB DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_lp_ai_analysis ON landing_pages USING gin(ai_analysis)
  WHERE ai_analysis IS NOT NULL;
