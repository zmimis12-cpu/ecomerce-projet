import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDebugSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminDashboardPage() {
  const d = await getDebugSession();
  if (!d.authId) redirect("/login");

  const statusColor = {
    found: "bg-green-100 border-green-300 text-green-900",
    not_found: "bg-red-100 border-red-300 text-red-900",
    error: "bg-red-100 border-red-300 text-red-900",
    no_auth: "bg-gray-100 border-gray-300 text-gray-900",
  }[d.profileFetchStatus];

  return (
    <div className="max-w-2xl mx-auto space-y-4 font-mono text-sm">

      <h1 className="text-base font-bold">🔍 Debug — Raw Supabase Data</h1>
      <p className="text-xs text-red-600 font-sans">
        ⚠️ DEBUG MODE — remove before production
      </p>

      {/* Environment */}
      <Section title="🌐 Environment">
        <Row label="SUPABASE_URL" value={d.supabaseUrl} highlight={!d.supabaseUrl.includes("placeholder")} bad={d.supabaseUrl.includes("placeholder") || d.supabaseUrl === "NOT_SET"} />
        <Row label="URL valid" value={d.supabaseUrl.startsWith("https://") && !d.supabaseUrl.includes("placeholder") ? "✅ YES" : "❌ NO — fix env vars on Vercel"} bad={!d.supabaseUrl.startsWith("https://") || d.supabaseUrl.includes("placeholder")} />
      </Section>

      {/* Auth */}
      <Section title="🔐 Auth User (auth.users)">
        <Row label="auth error"  value={d.authError ?? "none"} bad={!!d.authError} />
        <Row label="auth id"     value={d.authId ?? "null"} />
        <Row label="auth email"  value={d.authEmail ?? "null"} />
      </Section>

      {/* Profile fetch */}
      <Section title="👤 Profile Query (public.users)">
        <div className={`rounded border px-3 py-2 text-xs font-sans mb-2 ${statusColor}`}>
          Status: <strong>{d.profileFetchStatus.toUpperCase()}</strong>
        </div>
        <Row label="fetch error"  value={d.profileFetchError ?? "none"} bad={!!d.profileFetchError} />
        <Row label="profile id"   value={d.profileId ?? "null"} />
        <Row label="profile email" value={d.profileEmail ?? "null"} />
        <Row label="role in DB"   value={d.profileRole ?? "null"} highlight={d.profileRole === "super_admin"} />
        <Row label="is_active"    value={d.profileIsActive === null ? "null" : String(d.profileIsActive)} />
        <Row label="hasProfile"   value={String(d.hasProfile)} highlight={d.hasProfile} bad={!d.hasProfile} />
      </Section>

      {/* ID match */}
      <Section title="🔗 ID Match (critical)">
        <Row
          label="auth.id = profile.id"
          value={
            d.authId && d.profileId
              ? d.authId === d.profileId ? "✅ MATCH" : `❌ MISMATCH\nauth:    ${d.authId}\nprofile: ${d.profileId}`
              : `Cannot check — profileId is ${d.profileId}`
          }
          bad={!!d.authId && !!d.profileId && d.authId !== d.profileId}
          highlight={!!d.authId && d.authId === d.profileId}
        />
      </Section>

      {/* What the app shows */}
      <Section title="🖥 What App Renders">
        <Row label="displayName" value={d.displayName} />
        <Row label="role used"   value={d.role} highlight={d.role === "super_admin"} bad={d.role === "viewer"} />
        <Row label="hasProfile"  value={String(d.hasProfile)} />
      </Section>

    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded border bg-slate-50 p-4 space-y-1.5">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 font-sans">{title}</p>
      {children}
    </div>
  );
}

function Row({ label, value, bad, highlight }: { label: string; value: string; bad?: boolean; highlight?: boolean }) {
  return (
    <div className="flex gap-3 items-start">
      <span className="w-36 shrink-0 text-slate-400 text-xs">{label}</span>
      <span className={`text-xs whitespace-pre-wrap break-all ${bad ? "text-red-600 font-bold" : highlight ? "text-green-700 font-bold" : "text-slate-900"}`}>
        {value}
      </span>
    </div>
  );
}
