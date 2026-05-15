-- ── Migration: Multi-provider delivery architecture ────────────────────────
-- Safe to run multiple times (IF NOT EXISTS everywhere)

-- 1. Delivery companies (Digylog, Ozone, etc.)
CREATE TABLE IF NOT EXISTS delivery_companies (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug         TEXT NOT NULL UNIQUE,      -- 'digylog', 'ozone'
  name         TEXT NOT NULL,             -- 'Digylog', 'Ozone Express'
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Delivery stores / accounts (one company can have many)
CREATE TABLE IF NOT EXISTS delivery_stores (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES delivery_companies(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,            -- 'Afrizone', 'ALODIA'
  slug            TEXT NOT NULL,            -- 'afrizone', 'alodia'
  api_token       TEXT,                     -- stored in DB (not env)
  api_base_url    TEXT,
  webhook_secret  TEXT,
  google_sheet_id TEXT,
  google_sheet_name TEXT,
  delivery_fee_mad NUMERIC(8,2) DEFAULT 25,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  is_default      BOOLEAN NOT NULL DEFAULT false,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_ds_company ON delivery_stores(company_id);
CREATE INDEX IF NOT EXISTS idx_ds_default ON delivery_stores(is_default) WHERE is_default = true;

-- 3. Add delivery_store_id to orders (non-breaking)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_company_id UUID REFERENCES delivery_companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_store_id   UUID REFERENCES delivery_stores(id)    ON DELETE SET NULL;

-- 4. Seed existing Digylog as default company + store
INSERT INTO delivery_companies (slug, name, is_active)
VALUES ('digylog', 'Digylog', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO delivery_stores (company_id, name, slug, is_active, is_default)
SELECT id, 'Default', 'default', true, true
FROM delivery_companies WHERE slug = 'digylog'
ON CONFLICT (company_id, slug) DO NOTHING;

-- RLS
ALTER TABLE delivery_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_stores    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dc_auth" ON delivery_companies;
DROP POLICY IF EXISTS "ds_auth" ON delivery_stores;

CREATE POLICY "dc_auth" ON delivery_companies FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "ds_auth" ON delivery_stores    FOR ALL USING (auth.uid() IS NOT NULL);
