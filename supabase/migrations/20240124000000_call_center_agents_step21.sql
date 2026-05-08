-- ── Migration: call_center_agents table + callback column ────────────────────

CREATE TABLE IF NOT EXISTS call_center_agents (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name             TEXT,
  active                   BOOLEAN NOT NULL DEFAULT true,
  salary_type              TEXT NOT NULL DEFAULT 'commission',
  -- commission | fixed | hybrid
  fixed_salary_mad         NUMERIC(10,2) DEFAULT 0,
  commission_per_delivered NUMERIC(8,2)  DEFAULT 3,  -- MAD per delivered_paid order
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cca_user ON call_center_agents(user_id);
ALTER TABLE call_center_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cca_auth" ON call_center_agents FOR ALL USING (auth.uid() IS NOT NULL);

-- ── Add callback_scheduled_at to orders if missing ────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS callback_scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS callback_reason        TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_callback ON orders(callback_scheduled_at)
  WHERE callback_scheduled_at IS NOT NULL;
