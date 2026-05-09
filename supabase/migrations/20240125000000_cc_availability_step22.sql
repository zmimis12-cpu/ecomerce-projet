-- ── Migration: Call center agent availability + auto-assignment ───────────────

-- Agent availability status
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS availability_status TEXT DEFAULT 'offline';
  -- available | in_call | away | offline

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS assigned_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS call_status   TEXT DEFAULT 'pending_call';
  -- pending_call | in_call | confirmed | refused | callback_later | no_answer | fake_order | duplicate

CREATE INDEX IF NOT EXISTS idx_users_availability ON users(availability_status)
  WHERE role = 'call_center_agent';
CREATE INDEX IF NOT EXISTS idx_orders_call_status ON orders(call_status);
CREATE INDEX IF NOT EXISTS idx_orders_assigned_at ON orders(assigned_at);
