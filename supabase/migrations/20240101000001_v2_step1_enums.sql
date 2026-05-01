-- =============================================================================
-- E-COMMERCE OPERATIONS SYSTEM — SCHEMA v2 MIGRATIONS
-- Apply ON TOP of ecommerce_schema.sql (v1)
-- Engine: PostgreSQL / Supabase
-- Strategy: ALTER, ADD, CREATE only. Nothing from v1 is removed or broken.
-- =============================================================================

-- =============================================================================
-- SECTION 1 — ENUM UPGRADES
-- Expand user_role to full 7-role model required for RLS granularity.
-- We use ALTER TYPE … ADD VALUE (safe, non-destructive, no lock needed in PG14+).
-- =============================================================================

-- [MOD] user_role: add 4 new roles to the existing enum
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'call_center_agent';   -- replaces generic 'agent'
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'scanner_agent';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'finance';             -- replaces generic 'accountant'
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'viewer';              -- replaces 'readonly'

-- NOTE: Existing rows with 'agent', 'accountant', 'readonly' remain valid.
-- Migrate existing users to new roles via:
--   UPDATE users SET role = 'call_center_agent' WHERE role = 'agent';
--   UPDATE users SET role = 'finance'            WHERE role = 'accountant';
--   UPDATE users SET role = 'viewer'             WHERE role = 'readonly';
-- Run these manually after confirming no active sessions depend on old values.

-- [NEW] scan_type enum — used by scanner_logs
CREATE TYPE scan_type AS ENUM ('entry', 'exit', 'return');

-- [NEW] ad_level enum — for ad_campaigns hierarchy (campaign > adset > ad)
CREATE TYPE ad_level AS ENUM ('campaign', 'adset', 'ad');


-- ============================================================
-- RUN THIS FILE FIRST. Commit before running step 2.
-- Reason: ALTER TYPE ADD VALUE must be committed before the
-- new enum values can be referenced in policies or columns.
-- ============================================================
