-- ── Migration: Intelligent reconciliation system ─────────────────────────────

CREATE TABLE IF NOT EXISTS reconciliation_issues (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id        UUID REFERENCES orders(id) ON DELETE SET NULL,
  tracking        TEXT,
  order_number    TEXT,
  city            TEXT,

  -- Provider context
  provider_slug   TEXT NOT NULL DEFAULT 'digylog',
  store_name      TEXT,
  invoice_ref     TEXT,

  -- Financial data
  cod_amount      NUMERIC(12,2),
  expected_fee    NUMERIC(12,2),
  actual_fee      NUMERIC(12,2),
  expected_net    NUMERIC(12,2),
  actual_paid     NUMERIC(12,2),
  difference      NUMERIC(12,2) GENERATED ALWAYS AS (
    COALESCE(actual_paid, 0) - COALESCE(expected_net, 0)
  ) STORED,

  -- Issue classification
  issue_type      TEXT NOT NULL,
  -- delivered_not_paid | paid_but_not_delivered | casa_overcharged
  -- shipping_fee_mismatch | missing_return | unknown_return
  -- missing_refund | unknown_refund | damaged_return
  -- quantity_mismatch | invoice_total_mismatch

  severity        TEXT NOT NULL DEFAULT 'warning',
  -- info | warning | error

  description     TEXT,
  is_resolved     BOOLEAN NOT NULL DEFAULT false,
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  resolution_note TEXT,

  detected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ri_order      ON reconciliation_issues(order_id);
CREATE INDEX IF NOT EXISTS idx_ri_tracking   ON reconciliation_issues(tracking);
CREATE INDEX IF NOT EXISTS idx_ri_provider   ON reconciliation_issues(provider_slug);
CREATE INDEX IF NOT EXISTS idx_ri_issue      ON reconciliation_issues(issue_type);
CREATE INDEX IF NOT EXISTS idx_ri_resolved   ON reconciliation_issues(is_resolved);
CREATE INDEX IF NOT EXISTS idx_ri_detected   ON reconciliation_issues(detected_at DESC);

ALTER TABLE reconciliation_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ri_auth" ON reconciliation_issues FOR ALL
  USING (auth.uid() IS NOT NULL);

-- Track last sync per provider
CREATE TABLE IF NOT EXISTS provider_sync_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_slug TEXT NOT NULL,
  store_name    TEXT,
  sync_type     TEXT NOT NULL,  -- statuses | invoices | refunds | documents
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at   TIMESTAMPTZ,
  records_synced INT DEFAULT 0,
  issues_found  INT DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'running',  -- running | success | error
  error_message TEXT
);
