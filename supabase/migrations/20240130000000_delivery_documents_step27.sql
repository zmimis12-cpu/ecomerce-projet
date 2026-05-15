-- ── Migration: Generic delivery documents system ─────────────────────────────

-- Normalized documents table (BL, BR, BLFC, invoices, refunds, ramassage)
CREATE TABLE IF NOT EXISTS delivery_documents (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_slug   TEXT NOT NULL,                    -- 'digylog', 'ozone'
  store_id        UUID REFERENCES delivery_stores(id) ON DELETE SET NULL,
  store_name      TEXT,

  document_type   TEXT NOT NULL,
  -- BL | BR | BLFC | BRFC | INVOICE | REFUND | RAMASSAGE | PAYOUT | RETURN_BATCH

  document_number TEXT,
  document_date   DATE,
  status          TEXT NOT NULL DEFAULT 'imported', -- imported | synced | reconciled | error

  -- Financial totals
  total_cod       NUMERIC(12,2),
  total_fees      NUMERIC(12,2),
  total_payout    NUMERIC(12,2),
  total_refunds   NUMERIC(12,2),
  line_count      INT DEFAULT 0,

  -- Source tracking
  source          TEXT DEFAULT 'api_sync',          -- api_sync | webhook | manual_import | manual_csv
  raw_payload     JSONB,
  pdf_url         TEXT,
  synced_at       TIMESTAMPTZ,

  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (provider_slug, document_type, document_number)
);

CREATE INDEX IF NOT EXISTS idx_dd_provider  ON delivery_documents(provider_slug);
CREATE INDEX IF NOT EXISTS idx_dd_store     ON delivery_documents(store_id);
CREATE INDEX IF NOT EXISTS idx_dd_type      ON delivery_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_dd_date      ON delivery_documents(document_date DESC);
CREATE INDEX IF NOT EXISTS idx_dd_status    ON delivery_documents(status);

-- Document lines (one per tracking/order within a document)
CREATE TABLE IF NOT EXISTS delivery_document_lines (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id      UUID NOT NULL REFERENCES delivery_documents(id) ON DELETE CASCADE,
  tracking_number  TEXT,
  order_id         UUID REFERENCES orders(id) ON DELETE SET NULL,
  order_number     TEXT,

  -- Financial per line
  city             TEXT,
  cod_amount       NUMERIC(12,2),
  delivery_fee     NUMERIC(12,2),
  return_fee       NUMERIC(12,2),
  payout_amount    NUMERIC(12,2),
  refund_amount    NUMERIC(12,2),

  -- Provider data
  provider_status  TEXT,
  line_type        TEXT,  -- delivered | returned | refused | refunded
  raw_line         JSONB,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ddl_document  ON delivery_document_lines(document_id);
CREATE INDEX IF NOT EXISTS idx_ddl_tracking  ON delivery_document_lines(tracking_number);
CREATE INDEX IF NOT EXISTS idx_ddl_order     ON delivery_document_lines(order_id);

-- RLS
ALTER TABLE delivery_documents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_document_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dd_auth"  ON delivery_documents      FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "ddl_auth" ON delivery_document_lines FOR ALL USING (auth.uid() IS NOT NULL);
