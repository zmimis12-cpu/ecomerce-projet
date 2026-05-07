-- ── Migration: Webhook deduplication + missing order columns ─────────────────
-- Add event_hash for deduplication on delivery_status_events

ALTER TABLE delivery_status_events
  ADD COLUMN IF NOT EXISTS event_hash          TEXT,
  ADD COLUMN IF NOT EXISTS normalized_status   TEXT,
  ADD COLUMN IF NOT EXISTS refused_at          TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dse_event_hash
  ON delivery_status_events(event_hash)
  WHERE event_hash IS NOT NULL;

-- ── Add missing columns to orders ─────────────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipment_status             TEXT,
  ADD COLUMN IF NOT EXISTS shipment_status_updated_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refused_at                  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_webhook_payload        JSONB;

-- ── orphan_webhooks: store events for unknown trackings ───────────────────────
CREATE TABLE IF NOT EXISTS orphan_webhooks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tracking_number TEXT NOT NULL,
  raw_payload     JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orphan_tracking ON orphan_webhooks(tracking_number);
ALTER TABLE orphan_webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ow_auth" ON orphan_webhooks FOR ALL USING (auth.uid() IS NOT NULL);
