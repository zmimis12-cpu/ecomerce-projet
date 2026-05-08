-- ── Migration: digylog_documents + digylog_document_lines ───────────────────
-- Generic Digylog document system — works for BL, BR, RAMASSAGE, BLFC, BRFC,
-- PAYMENT_INVOICE, REFUND, OTHER.
-- Data source: manual CSV/paste import NOW, API-ready for future.

-- ── 1. Document types enum ────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE digylog_doc_type AS ENUM (
    'BL', 'BR', 'RAMASSAGE', 'BLFC', 'BRFC',
    'PAYMENT_INVOICE', 'REFUND', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. Main documents table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS digylog_documents (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_type         digylog_doc_type NOT NULL,
  document_number       TEXT NOT NULL,
  document_date         DATE,
  status                TEXT NOT NULL DEFAULT 'imported',
  -- imported | reconciled | disputed | closed | scanning | scan_complete
  total_lines           INT  NOT NULL DEFAULT 0,
  matched_lines         INT  NOT NULL DEFAULT 0,
  unmatched_lines       INT  NOT NULL DEFAULT 0,
  total_cod_mad         NUMERIC(14,2) DEFAULT 0,
  total_fees_mad        NUMERIC(14,2) DEFAULT 0,
  total_payout_mad      NUMERIC(14,2) DEFAULT 0,
  pdf_url               TEXT,
  external_document_id  TEXT,         -- Digylog internal ID if available from API
  source                TEXT NOT NULL DEFAULT 'manual_import',
  -- manual_import | api_sync | webhook
  raw_payload           JSONB DEFAULT '{}'::jsonb,
  notes                 TEXT,
  imported_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  synced_at             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dd_number_type
  ON digylog_documents(document_number, document_type);
CREATE INDEX IF NOT EXISTS idx_dd_type       ON digylog_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_dd_status     ON digylog_documents(status);
CREATE INDEX IF NOT EXISTS idx_dd_date       ON digylog_documents(document_date DESC);
CREATE INDEX IF NOT EXISTS idx_dd_created    ON digylog_documents(created_at DESC);

ALTER TABLE digylog_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dd_auth" ON digylog_documents FOR ALL USING (auth.uid() IS NOT NULL);

-- ── 3. Document lines table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS digylog_document_lines (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id      UUID NOT NULL REFERENCES digylog_documents(id) ON DELETE CASCADE,
  line_number      INT,
  tracking_number  TEXT,
  order_id         UUID REFERENCES orders(id) ON DELETE SET NULL,
  -- Financials
  cod_amount_mad   NUMERIC(12,2) DEFAULT 0,
  delivery_fee_mad NUMERIC(12,2) DEFAULT 0,
  return_fee_mad   NUMERIC(12,2) DEFAULT 0,
  payout_amount_mad NUMERIC(12,2) DEFAULT 0,
  -- Location / status
  city             TEXT,
  status           TEXT,           -- e.g. "livré", "retourné", etc.
  -- Matching
  matched          BOOLEAN NOT NULL DEFAULT false,
  match_status     TEXT NOT NULL DEFAULT 'pending',
  -- pending | matched | unmatched | mismatch
  mismatch_reasons TEXT[],         -- array of mismatch descriptions
  -- Scan status (for BR / RAMASSAGE)
  scan_status      TEXT DEFAULT 'not_scanned',
  -- not_scanned | scanned | unexpected | missing
  scanned_at       TIMESTAMPTZ,
  scanned_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  -- Raw data
  raw_line_payload JSONB DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ddl_document  ON digylog_document_lines(document_id);
CREATE INDEX IF NOT EXISTS idx_ddl_tracking  ON digylog_document_lines(tracking_number);
CREATE INDEX IF NOT EXISTS idx_ddl_order     ON digylog_document_lines(order_id);
CREATE INDEX IF NOT EXISTS idx_ddl_matched   ON digylog_document_lines(matched);
CREATE INDEX IF NOT EXISTS idx_ddl_scan      ON digylog_document_lines(scan_status);

ALTER TABLE digylog_document_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ddl_auth" ON digylog_document_lines FOR ALL USING (auth.uid() IS NOT NULL);

-- ── 4. Status sync log ────────────────────────────────────────────────────────
-- Logs each manual/auto status sync run
CREATE TABLE IF NOT EXISTS digylog_status_syncs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  triggered_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  source          TEXT NOT NULL DEFAULT 'manual',  -- manual | webhook | cron
  total_checked   INT NOT NULL DEFAULT 0,
  total_updated   INT NOT NULL DEFAULT 0,
  total_unchanged INT NOT NULL DEFAULT 0,
  total_failed    INT NOT NULL DEFAULT 0,
  details         JSONB DEFAULT '[]'::jsonb,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at     TIMESTAMPTZ
);

ALTER TABLE digylog_status_syncs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dss_auth" ON digylog_status_syncs FOR ALL USING (auth.uid() IS NOT NULL);
