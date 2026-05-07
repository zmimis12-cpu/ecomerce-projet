-- ── Migration: BR validation + pending return queue ─────────────────────────

-- ── 1. Digylog Return Batches (BR officiel importé) ──────────────────────────
CREATE TABLE IF NOT EXISTS digylog_return_batches (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  br_number       TEXT NOT NULL UNIQUE,
  tracking_numbers TEXT[]  NOT NULL DEFAULT '{}',
  imported_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  imported_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'active',  -- active | closed
  notes           TEXT,
  raw_payload     JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_drb_br_number ON digylog_return_batches(br_number);
CREATE INDEX IF NOT EXISTS idx_drb_status    ON digylog_return_batches(status);

-- GIN index for fast tracking number lookup inside array
CREATE INDEX IF NOT EXISTS idx_drb_trackings ON digylog_return_batches USING gin(tracking_numbers);

ALTER TABLE digylog_return_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "drb_auth" ON digylog_return_batches FOR ALL USING (auth.uid() IS NOT NULL);

-- ── 2. Pending Return Scans Queue ─────────────────────────────────────────────
-- Scans accumulate here, condition assigned later
CREATE TABLE IF NOT EXISTS pending_return_scans (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tracking_number   TEXT NOT NULL,
  order_id          UUID REFERENCES orders(id) ON DELETE SET NULL,
  br_number         TEXT,  -- which BR this tracking belongs to
  scanned_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  operator_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  processing_status TEXT NOT NULL DEFAULT 'pending_review',
  -- pending_review | processed | rejected | duplicate
  condition         TEXT,  -- set when processed
  notes             TEXT,
  return_id         UUID REFERENCES returns(id) ON DELETE SET NULL,
  rejection_reason  TEXT
);

CREATE INDEX IF NOT EXISTS idx_prs_tracking ON pending_return_scans(tracking_number);
CREATE INDEX IF NOT EXISTS idx_prs_status   ON pending_return_scans(processing_status);
CREATE INDEX IF NOT EXISTS idx_prs_operator ON pending_return_scans(operator_id);
CREATE INDEX IF NOT EXISTS idx_prs_scanned  ON pending_return_scans(scanned_at DESC);

ALTER TABLE pending_return_scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prs_auth" ON pending_return_scans FOR ALL USING (auth.uid() IS NOT NULL);
