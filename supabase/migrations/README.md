# Supabase Migrations

Apply these files **in order** via the Supabase SQL Editor or Supabase CLI.

## Order of execution

| File | Description |
|------|-------------|
| `20240101000000_v1_initial_schema.sql` | Full initial schema (all tables, enums, indexes, RLS v1) |
| `20240101000001_v2_step1_enums.sql` | **Run first** — adds new enum values (must be committed before step 2) |
| `20240101000002_v2_step2_migrations.sql` | **Run after step 1** — adds shops, scanner_logs, cost columns, etc. |

## Why two steps for v2?

PostgreSQL requires `ALTER TYPE ADD VALUE` to be committed in its own transaction
before the new enum values can be referenced anywhere. Running both files in a
single SQL editor session would fail with:
`unsafe use of new value of enum type`.

Always run step 1, wait for it to succeed, then run step 2.
