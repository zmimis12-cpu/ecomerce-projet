# GestionPro

**E-commerce Operations Management System**  
Next.js 15 · TypeScript · TailwindCSS · Supabase · Vercel

---

## Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript (strict) |
| Styling | TailwindCSS + shadcn/ui |
| Database | PostgreSQL via Supabase |
| Auth | Supabase Auth |
| Storage | Supabase Storage |
| Hosting | Vercel |

---

## Prerequisites

- Node.js 20+ (22 recommended)
- npm 10+
- A [Supabase](https://supabase.com) project
- A [Vercel](https://vercel.com) account (for deployment)

---

## Local Setup

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/gestionpro.git
cd gestionpro
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Find your keys in: **Supabase Dashboard → Project Settings → API**

> ⚠️ Never commit `.env.local` — it is in `.gitignore`.

### 3. Run locally

```bash
npm run dev
# Open http://localhost:3000
```

---

## Apply Supabase Migrations

Run these files **in order** via **Supabase Dashboard → SQL Editor**.

| # | File | Description |
|---|------|-------------|
| 1 | `supabase/migrations/20240101000000_v1_initial_schema.sql` | Full schema: tables, enums, indexes, RLS |
| 2 | `supabase/migrations/20240101000001_v2_step1_enums.sql` | New enum values — **commit before step 3** |
| 3 | `supabase/migrations/20240101000002_v2_step2_migrations.sql` | Shops, scanner_logs, cost columns, etc. |
| 4 | `supabase/migrations/20240102000000_auth_profile_trigger.sql` | Auth trigger + profile helpers |

> **Why run step 2 and 3 separately?**  
> PostgreSQL requires `ALTER TYPE ADD VALUE` to be committed before the new enum values can be referenced. Splitting them into two SQL Editor runs solves this.

---

## Create the First Admin User

### Step 1 — Create the user in Supabase Auth

Option A — Dashboard:
> **Supabase Dashboard → Authentication → Users → Add User**  
> Enter email + strong password. Click **Create User**.

Option B — Have them sign in via `/login` (the trigger auto-creates their profile).

### Step 2 — Promote to super_admin

Run in the SQL Editor (after migration #4 is applied):

```sql
SELECT promote_to_super_admin('admin@yourcompany.com');
```

Or the equivalent direct UPDATE:

```sql
UPDATE public.users
SET role = 'super_admin'
WHERE email = 'admin@yourcompany.com';
```

### Step 3 — Log in

Go to `http://localhost:3000/login` and sign in with the credentials.  
You should see the dashboard with role **Super Administrateur** displayed.

---

## What to Do if a Profile Row is Missing

The trigger (`handle_new_auth_user`) automatically creates a `public.users` row  
whenever a new auth user is created. If for any reason the row is missing:

**Option A — The app self-heals:**  
The admin layout calls `get_or_create_profile()` automatically. A yellow banner  
will appear informing the user that a default profile was created.

**Option B — Manual SQL:**
```sql
INSERT INTO public.users (id, email, full_name, role, is_active)
SELECT
  id,
  email,
  COALESCE(raw_user_meta_data->>'full_name', email),
  'viewer',
  true
FROM auth.users
WHERE email = 'the-user@example.com'
ON CONFLICT (id) DO NOTHING;
```

**Option B — Backfill all missing profiles:**
```sql
-- Re-runs the backfill from migration #4 (safe, idempotent)
INSERT INTO public.users (id, email, full_name, role, is_active, metadata)
SELECT
  au.id, au.email,
  COALESCE(NULLIF(TRIM(au.raw_user_meta_data->>'full_name'), ''), au.email),
  'viewer', true, '{}'::jsonb
FROM auth.users au
WHERE NOT EXISTS (SELECT 1 FROM public.users pu WHERE pu.id = au.id)
ON CONFLICT (id) DO NOTHING;
```

---

## Test Login Checklist

1. ✅ Go to `/login`
2. ✅ Enter credentials → should redirect to `/admin`
3. ✅ Dashboard shows your name, email, role, and "Actif" status
4. ✅ Go to `/login` again while logged in → redirected to `/admin` (no loop)
5. ✅ Click **Déconnexion** → redirected to `/login`
6. ✅ Try `/admin` directly while logged out → redirected to `/login?redirectTo=/admin`

---

## Role System

| Role | Label | Description |
|------|-------|-------------|
| `super_admin` | Super Administrateur | Full access to everything |
| `admin` | Administrateur | Full access minus super-admin tools |
| `manager` | Manager | Manages orders, team, reports |
| `finance` | Finance | Financial data and expenses |
| `call_center_agent` | Agent Call Center | Order confirmation, call logs |
| `scanner_agent` | Agent Scanner | Warehouse scanning only |
| `viewer` | Lecteur | Read-only (default for new users) |

### Useful role helpers

```ts
import { hasRole, isAdminRole, getRoleLabel } from "@/lib/auth/roles";
import { requireUser, requireAdmin, requireRole } from "@/lib/auth/session";

// In any server component or action:
const session = await requireUser();        // redirects if not logged in
const session = await requireAdmin();       // redirects if not admin
const session = await requireRole(["finance", "admin"]);

// Pure role checks (no DB call):
hasRole(user.role, ["admin", "super_admin"])  // → boolean
isAdminRole(user.role)                        // → boolean
getRoleLabel("call_center_agent")             // → "Agent Call Center"
```

---

## Project Structure

```
gestionpro/
├── app/
│   ├── (auth)/
│   │   ├── layout.tsx               # Centered auth layout
│   │   └── login/page.tsx           # Login page (async searchParams)
│   ├── admin/
│   │   ├── layout.tsx               # ensureProfile() + sidebar/header shell
│   │   ├── page.tsx                 # Dashboard with role/status display
│   │   └── actions.ts               # logout() server action
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                     # redirect / → /admin
│
├── components/
│   ├── auth/login-form.tsx
│   └── admin/
│       ├── sidebar.tsx
│       ├── header.tsx               # Role badge in top bar
│       ├── dashboard-placeholder.tsx # Full status display
│       └── missing-profile-banner.tsx # Safety net warning
│
├── lib/
│   ├── auth/
│   │   ├── roles.ts                 # hasRole, isAdminRole, getRoleLabel, badges
│   │   └── session.ts               # getSession, requireUser, requireAdmin,
│   │                                #   requireRole, ensureProfile
│   ├── supabase/
│   │   ├── client.ts                # Browser client
│   │   ├── server.ts                # Server client (cookies)
│   │   └── admin.ts                 # Service role (server-only)
│   └── utils.ts                     # cn()
│
├── types/database.ts                # UserRole, AppUser, SessionUser, RPC types
│
├── supabase/
│   ├── migrations/
│   │   ├── 20240101000000_v1_initial_schema.sql
│   │   ├── 20240101000001_v2_step1_enums.sql
│   │   ├── 20240101000002_v2_step2_migrations.sql
│   │   └── 20240102000000_auth_profile_trigger.sql  ← NEW
│   └── STORAGE_SETUP.md
│
├── middleware.ts                    # JWT refresh + /admin guard
├── next.config.ts
├── tailwind.config.ts
├── .env.example
├── .gitignore
└── README.md
```

---

## Generate TypeScript Types (recommended after migrations)

```bash
npx supabase gen types typescript \
  --project-id YOUR_PROJECT_REF \
  > types/database.ts
```

This replaces the manual stubs with fully accurate generated types.

---

## Deploy to Vercel

```bash
npm install -g vercel
vercel
```

Add environment variables in **Vercel Dashboard → Project → Settings → Environment Variables**:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Your service role key |
| `NEXT_PUBLIC_APP_URL` | `https://your-app.vercel.app` |

Then add your Vercel URL to Supabase CORS:  
**Supabase Dashboard → Project Settings → API → CORS → Add origin**

---

## Scripts

```bash
npm run dev        # Development server
npm run build      # Production build
npm run start      # Production server
npm run lint       # ESLint
npm run type-check # TypeScript check (no emit)
```

