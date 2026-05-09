-- ── Migration: Call center agent payments ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS call_center_agent_payments (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_start         DATE NOT NULL,
  period_end           DATE NOT NULL,
  delivered_paid_count INT  NOT NULL DEFAULT 0,
  commission_per_order NUMERIC(8,2) NOT NULL DEFAULT 3,
  gross_amount         NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
  remaining_amount     NUMERIC(12,2) GENERATED ALWAYS AS (gross_amount - paid_amount) STORED,
  status               TEXT NOT NULL DEFAULT 'unpaid',
  -- unpaid | partially_paid | paid
  paid_at              TIMESTAMPTZ,
  paid_by              UUID REFERENCES users(id) ON DELETE SET NULL,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ccap_agent    ON call_center_agent_payments(agent_id);
CREATE INDEX IF NOT EXISTS idx_ccap_status   ON call_center_agent_payments(status);
CREATE INDEX IF NOT EXISTS idx_ccap_period   ON call_center_agent_payments(period_start, period_end);

ALTER TABLE call_center_agent_payments ENABLE ROW LEVEL SECURITY;

-- Agent can see only their own payments
CREATE POLICY "ccap_agent_select" ON call_center_agent_payments
  FOR SELECT USING (
    agent_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.role IN ('super_admin','admin','manager','finance')
    )
  );

-- Only admins can insert/update payments
CREATE POLICY "ccap_admin_write" ON call_center_agent_payments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.role IN ('super_admin','admin','manager')
    )
  );
