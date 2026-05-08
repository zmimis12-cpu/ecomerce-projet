-- ── Migration: Enhance audit_logs + add missing columns ─────────────────────

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS user_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS action_type         TEXT,
  ADD COLUMN IF NOT EXISTS entity_type         TEXT,
  ADD COLUMN IF NOT EXISTS entity_id           TEXT,
  ADD COLUMN IF NOT EXISTS entity_label        TEXT,
  ADD COLUMN IF NOT EXISTS changed_fields      TEXT[],
  ADD COLUMN IF NOT EXISTS source_module       TEXT;

-- Better indexes for admin UI filters
CREATE INDEX IF NOT EXISTS idx_al_action_type   ON audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_al_entity_type   ON audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_al_source_module ON audit_logs(source_module);
CREATE INDEX IF NOT EXISTS idx_al_created_desc  ON audit_logs(created_at DESC);
