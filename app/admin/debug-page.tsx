/**
 * /admin/debug — temporary debug page
 * Shows exactly what the app reads from Supabase.
 * DELETE THIS FILE before going to production.
 */
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DebugPage() {
  const supabase = await createClient();

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  const authErrorMsg = authErr?.message ?? null;

  let profileRow: Record<string, unknown> | null = null;
  let profileErrorMsg: string | null = null;

  if (user) {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    profileRow = data as Record<string, unknown> | null;
    profileErrorMsg = error?.message ?? null;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "NOT SET";

  return (
    <div className="max-w-2xl mx-auto p-6 font-mono text-sm space-y-6">
      <h1 className="text-lg font-bold">🔍 Debug — Profile Fetch</h1>

      <section className="rounded border p-4 space-y-2 bg-slate-50">
        <p className="font-bold text-slate-500 uppercase text-xs">Environment</p>
        <Row label="SUPABASE_URL" value={supabaseUrl} />
        <Row
          label="Points to"
          value={supabaseUrl.includes("placeholder")
            ? "❌ PLACEHOLDER — env vars not set on Vercel!"
            : "✅ Real Supabase project"}
          bad={supabaseUrl.includes("placeholder")}
        />
      </section>

      <section className="rounded border p-4 space-y-2 bg-slate-50">
        <p className="font-bold text-slate-500 uppercase text-xs">Auth User (auth.users)</p>
        {authErrorMsg && <Row label="Auth error" value={authErrorMsg} bad />}
        <Row label="auth user id"   value={user?.id ?? "null"} />
        <Row label="auth email"     value={user?.email ?? "null"} />
        <Row label="email confirmed" value={user?.email_confirmed_at ? "✅ yes" : "⚠️ no"} />
      </section>

      <section className="rounded border p-4 space-y-2 bg-slate-50">
        <p className="font-bold text-slate-500 uppercase text-xs">App Profile (public.users)</p>
        {profileErrorMsg && <Row label="Query error" value={profileErrorMsg} bad />}
        {!profileRow && !profileErrorMsg && (
          <Row label="Row found" value="❌ NO ROW — auth.id not in public.users" bad />
        )}
        {profileRow && (
          <>
            <Row label="Row found"  value="✅ yes" />
            <Row label="id"         value={String(profileRow.id)} />
            <Row label="email"      value={String(profileRow.email)} />
            <Row label="full_name"  value={String(profileRow.full_name)} />
            <Row label="role"       value={String(profileRow.role)} highlight />
            <Row label="is_active"  value={String(profileRow.is_active)} />
          </>
        )}
      </section>

      <section className="rounded border p-4 space-y-2 bg-slate-50">
        <p className="font-bold text-slate-500 uppercase text-xs">ID Match Check</p>
        <Row
          label="auth.id = public.id"
          value={
            user && profileRow
              ? user.id === String(profileRow.id)
                ? "✅ MATCH"
                : `❌ MISMATCH\nauth: ${user.id}\ndb:   ${profileRow.id}`
              : "Cannot check — one is null"
          }
        />
      </section>

      <p className="text-xs text-slate-400">
        ⚠️ Delete <code>app/admin/debug/</code> before production.
      </p>
    </div>
  );
}

function Row({
  label, value, bad, highlight,
}: {
  label: string; value: string; bad?: boolean; highlight?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <span className="w-44 shrink-0 text-slate-500">{label}</span>
      <span className={bad ? "text-red-600 font-bold" : highlight ? "text-green-700 font-bold" : "text-slate-900"}>
        {value}
      </span>
    </div>
  );
}
