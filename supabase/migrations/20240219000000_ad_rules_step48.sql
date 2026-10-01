-- ── Règles automatiques pub (protection contre les pertes) ───────────────────
CREATE TABLE IF NOT EXISTS ad_rules (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             TEXT NOT NULL,
  enabled          BOOLEAN NOT NULL DEFAULT TRUE,
  simulate         BOOLEAN NOT NULL DEFAULT TRUE,   -- simulation : journalise sans toucher Meta
  level            TEXT NOT NULL CHECK (level IN ('product','ad')),
  product_id       UUID REFERENCES products(id) ON DELETE CASCADE,  -- NULL = tous les produits
  time_window      TEXT NOT NULL DEFAULT 'today' CHECK (time_window IN ('today','yesterday','3d','7d')),
  conditions       JSONB NOT NULL DEFAULT '[]',    -- [{metric, op, value}] — TOUTES doivent être vraies
  action           TEXT NOT NULL DEFAULT 'pause' CHECK (action IN ('pause','activate','notify')),
  cooldown_minutes INTEGER NOT NULL DEFAULT 60,
  last_run_at      TIMESTAMPTZ,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ad_rule_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rule_id     UUID REFERENCES ad_rules(id) ON DELETE CASCADE,
  rule_name   TEXT,
  level       TEXT,
  object_id   TEXT,            -- campagne (niveau produit) ou pub
  object_name TEXT,
  product_id  UUID,
  action      TEXT,
  simulated   BOOLEAN NOT NULL DEFAULT FALSE,
  success     BOOLEAN NOT NULL DEFAULT TRUE,
  error       TEXT,
  metrics     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rule_logs_created ON ad_rule_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rule_logs_obj ON ad_rule_logs(rule_id, object_id, created_at DESC);

ALTER TABLE ad_rules     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_rule_logs ENABLE ROW LEVEL SECURITY;
