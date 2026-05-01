-- =============================================================================
-- MIGRATION: Call Center — Step 5
-- Adds call_status, call tracking fields to orders.
-- Adds missing call_logs fields.
-- Adds RLS + indexes.
-- Safe — all ADD COLUMN use IF NOT EXISTS.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. New enum: call_result (more granular than call_disposition)
-- -----------------------------------------------------------------------------
-- Run in a separate transaction (enum ADD VALUE constraint)
ALTER TYPE call_disposition ADD VALUE IF NOT EXISTS 'confirmed';
ALTER TYPE call_disposition ADD VALUE IF NOT EXISTS 'refused';
ALTER TYPE call_disposition ADD VALUE IF NOT EXISTS 'no_answer';
ALTER TYPE call_disposition ADD VALUE IF NOT EXISTS 'unreachable';
ALTER TYPE call_disposition ADD VALUE IF NOT EXISTS 'wrong_number';
ALTER TYPE call_disposition ADD VALUE IF NOT EXISTS 'callback_requested';

-- -----------------------------------------------------------------------------
-- 2. orders — call tracking fields
-- -----------------------------------------------------------------------------
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS call_status    TEXT,            -- last call result
  ADD COLUMN IF NOT EXISTS call_attempts  INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_call_at   TIMESTAMPTZ;

-- -----------------------------------------------------------------------------
-- 3. call_logs — add missing fields
-- -----------------------------------------------------------------------------
ALTER TABLE call_logs
  ADD COLUMN IF NOT EXISTS call_started_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS call_ended_at    TIMESTAMPTZ;

-- call_logs already has: duration_seconds, disposition (= result), notes
-- Map: disposition = result in our app layer

-- -----------------------------------------------------------------------------
-- 4. RLS
-- -----------------------------------------------------------------------------
ALTER TABLE call_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_daily_stats  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "call_logs_select" ON call_logs;
DROP POLICY IF EXISTS "call_logs_insert" ON call_logs;
DROP POLICY IF EXISTS "agent_stats_select" ON agent_daily_stats;

CREATE POLICY "call_logs_select" ON call_logs
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "call_logs_insert" ON call_logs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "call_logs_update" ON call_logs
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "agent_stats_select" ON agent_daily_stats
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "agent_stats_upsert" ON agent_daily_stats
  FOR ALL USING (auth.uid() IS NOT NULL);

-- -----------------------------------------------------------------------------
-- 5. Indexes
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_cc_orders_assigned_to  ON orders(assigned_to);
CREATE INDEX IF NOT EXISTS idx_cc_orders_call_status  ON orders(call_status);
CREATE INDEX IF NOT EXISTS idx_cc_orders_last_call_at ON orders(last_call_at DESC);
CREATE INDEX IF NOT EXISTS idx_cc_call_logs_order     ON call_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_cc_call_logs_agent     ON call_logs(agent_id);
CREATE INDEX IF NOT EXISTS idx_cc_call_logs_created   ON call_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cc_agent_stats_agent   ON agent_daily_stats(agent_id, stat_date DESC);
