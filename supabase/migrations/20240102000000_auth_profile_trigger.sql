-- =============================================================================
-- MIGRATION: Auth profile auto-creation trigger
-- Step 2.5 — runs AFTER v1 schema and v2 migrations
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. FUNCTION: handle_new_auth_user
--    Fires after INSERT on auth.users.
--    Creates a matching row in public.users with safe defaults.
--    - full_name: pulled from raw_user_meta_data if present, falls back to email
--    - role: 'viewer' by default (safest — must be explicitly promoted)
--    - is_active: true
--
--    Uses ON CONFLICT DO NOTHING so re-running the trigger on an existing user
--    (e.g. during a migration replay) never overwrites a manually-set role.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER                    -- runs as the function owner (postgres), not the caller
SET search_path = public            -- prevents search_path hijacking
AS $$
BEGIN
  INSERT INTO public.users (
    id,
    email,
    full_name,
    role,
    is_active,
    metadata
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
      NEW.email   -- fallback: use email as display name until user updates profile
    ),
    'viewer',     -- safest default — admin must explicitly promote
    true,
    '{}'::jsonb
  )
  ON CONFLICT (id) DO NOTHING;     -- idempotent: never overwrite existing profile

  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. TRIGGER: on_auth_user_created
--    Attaches the function to auth.users INSERT events.
--    DROP IF EXISTS + CREATE ensures this is idempotent (safe to re-run).
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();


-- -----------------------------------------------------------------------------
-- 3. BACKFILL: create public.users rows for any auth.users that already exist
--    and do not yet have a matching profile row.
--    Safe to run multiple times — ON CONFLICT DO NOTHING is idempotent.
-- -----------------------------------------------------------------------------
INSERT INTO public.users (id, email, full_name, role, is_active, metadata)
SELECT
  au.id,
  au.email,
  COALESCE(
    NULLIF(TRIM(au.raw_user_meta_data->>'full_name'), ''),
    au.email
  ),
  'viewer',
  true,
  '{}'::jsonb
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.users pu WHERE pu.id = au.id
)
ON CONFLICT (id) DO NOTHING;


-- -----------------------------------------------------------------------------
-- 4. FUNCTION: get_or_create_profile
--    Called from the application layer as a safety net when the profile row
--    is unexpectedly missing (e.g. trigger failed, manual auth.users insert).
--    Returns the existing or newly-created public.users row.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_or_create_profile(p_user_id UUID)
RETURNS public.users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_email TEXT;
  v_full_name  TEXT;
  v_profile    public.users;
BEGIN
  -- Try to return an existing profile first
  SELECT * INTO v_profile FROM public.users WHERE id = p_user_id;
  IF FOUND THEN
    RETURN v_profile;
  END IF;

  -- Profile missing — look up auth.users
  SELECT
    email,
    COALESCE(NULLIF(TRIM(raw_user_meta_data->>'full_name'), ''), email)
  INTO v_auth_email, v_full_name
  FROM auth.users
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auth user % does not exist', p_user_id;
  END IF;

  -- Create missing profile with safe defaults
  INSERT INTO public.users (id, email, full_name, role, is_active, metadata)
  VALUES (p_user_id, v_auth_email, v_full_name, 'viewer', true, '{}'::jsonb)
  ON CONFLICT (id) DO NOTHING;

  SELECT * INTO v_profile FROM public.users WHERE id = p_user_id;
  RETURN v_profile;
END;
$$;


-- -----------------------------------------------------------------------------
-- 5. SEED HELPER: promote_to_super_admin
--    Convenience function for the initial setup.
--    Usage: SELECT promote_to_super_admin('admin@example.com');
--    Safe to call multiple times — idempotent.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.promote_to_super_admin(p_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE public.users
  SET role = 'super_admin', updated_at = NOW()
  WHERE email = LOWER(TRIM(p_email))
    AND is_active = true;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    RETURN 'ERROR: No active user found with email ' || p_email ||
           '. Make sure the user has logged in at least once to create their profile.';
  END IF;

  RETURN 'OK: ' || p_email || ' promoted to super_admin.';
END;
$$;


-- =============================================================================
-- HOW TO CREATE YOUR FIRST SUPER ADMIN
-- =============================================================================
-- Step 1: Create the user in Supabase Auth
--   Dashboard → Authentication → Users → Add User
--   Email: admin@yourcompany.com  |  Password: (strong password)
--   Or have them log in via your /login page once.
--
-- Step 2: Promote to super_admin (run in SQL Editor):
--   SELECT promote_to_super_admin('admin@yourcompany.com');
--
-- Alternative (direct UPDATE — same result):
--   UPDATE public.users
--   SET role = 'super_admin'
--   WHERE email = 'admin@yourcompany.com';
-- =============================================================================
