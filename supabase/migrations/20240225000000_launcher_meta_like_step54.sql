-- ── Lanceur "comme Meta" : Campagne → Ensembles de pubs → Pubs ───────────────
ALTER TABLE campaign_launches
  ADD COLUMN IF NOT EXISTS objective           TEXT NOT NULL DEFAULT 'OUTCOME_LEADS',
  ADD COLUMN IF NOT EXISTS budget_mode         TEXT NOT NULL DEFAULT 'abo',      -- abo = budget par ensemble, cbo = budget campagne (Advantage+)
  ADD COLUMN IF NOT EXISTS campaign_budget_usd NUMERIC(10,2);

CREATE TABLE IF NOT EXISTS campaign_launch_adsets (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  launch_id          UUID NOT NULL REFERENCES campaign_launches(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  daily_budget_usd   NUMERIC(10,2) NOT NULL DEFAULT 15,
  optimization_event TEXT NOT NULL DEFAULT 'LEAD',        -- LEAD | PURCHASE | INITIATED_CHECKOUT | LANDING_PAGE_VIEWS | LINK_CLICKS
  bid_strategy       TEXT NOT NULL DEFAULT 'LOWEST_COST_WITHOUT_CAP',
  cost_cap_usd       NUMERIC(10,2),
  age_min            INTEGER NOT NULL DEFAULT 18,
  age_max            INTEGER NOT NULL DEFAULT 65,
  genders            TEXT NOT NULL DEFAULT 'all',          -- all | male | female
  advantage_audience BOOLEAN NOT NULL DEFAULT TRUE,
  placements         JSONB NOT NULL DEFAULT '"auto"',      -- "auto" ou {"facebook":[...],"instagram":[...]}
  start_time         TIMESTAMPTZ,
  end_time           TIMESTAMPTZ,
  meta_adset_id      TEXT,
  status             TEXT NOT NULL DEFAULT 'pending',
  error              TEXT,
  position           INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_launch_adsets_launch ON campaign_launch_adsets(launch_id);
ALTER TABLE campaign_launch_adsets ENABLE ROW LEVEL SECURITY;

ALTER TABLE campaign_launch_items
  ADD COLUMN IF NOT EXISTS adset_ref     UUID REFERENCES campaign_launch_adsets(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS ad_name       TEXT,
  ADD COLUMN IF NOT EXISTS description   TEXT,
  ADD COLUMN IF NOT EXISTS display_link  TEXT,
  ADD COLUMN IF NOT EXISTS url_override  TEXT;

-- Lancements existants : un ensemble par défaut repris de l'ancien format
INSERT INTO campaign_launch_adsets (launch_id, name, daily_budget_usd, age_min, age_max, meta_adset_id, cost_cap_usd, bid_strategy, status)
SELECT l.id, l.name || ' — Large Maroc', l.daily_budget_usd, l.age_min, l.age_max, l.meta_adset_id, l.cost_cap_usd,
       CASE WHEN l.cost_cap_usd IS NOT NULL THEN 'COST_CAP' ELSE 'LOWEST_COST_WITHOUT_CAP' END,
       CASE WHEN l.meta_adset_id IS NOT NULL THEN 'created' ELSE 'pending' END
FROM campaign_launches l
WHERE NOT EXISTS (SELECT 1 FROM campaign_launch_adsets a WHERE a.launch_id = l.id);

UPDATE campaign_launch_items i SET adset_ref = a.id
FROM campaign_launch_adsets a
WHERE a.launch_id = i.launch_id AND i.adset_ref IS NULL;
