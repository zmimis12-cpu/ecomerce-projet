import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Phone, Award, CheckCircle2 } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Agent — Call Center" };
export const dynamic = "force-dynamic";

export default async function AgentDetailPage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  await requireRole(["super_admin", "admin", "manager"]);

  // Same source as agents list: public.users
  const { data: user } = await supabaseAdmin
    .from("users")
    .select("id, full_name, email, availability_status")
    .eq("id", agentId)
    .eq("role", "call_center_agent")
    .maybeSingle();

  if (!user) {
    return (
      <div className="space-y-4">
        <Link href="/admin/call-center/agents"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Agents
        </Link>
        <div className="rounded-xl border bg-card flex flex-col items-center justify-center py-16 gap-3">
          <p className="text-lg font-semibold">Agent introuvable</p>
          <Link href="/admin/call-center/agents" className="text-sm text-primary hover:underline">
            ← Retour aux agents
          </Link>
        </div>
      </div>
    );
  }

  const a = user as { id: string; full_name: string; email: string; availability_status: string | null };

  // Stats
  const [{ data: orders }, { data: logs }] = await Promise.all([
    supabaseAdmin.from("orders").select("id, order_number, status, total_amount_mad, created_at")
      .eq("assigned_to", a.id).order("created_at", { ascending: false }).limit(20),
    supabaseAdmin.from("call_logs").select("id, disposition, duration_seconds, created_at")
      .eq("agent_id", a.id).order("created_at", { ascending: false }).limit(20),
  ]);

  type Order = { id: string; order_number: string; status: string; total_amount_mad: number; created_at: string };
  type Log   = { id: string; disposition: string; duration_seconds: number | null; created_at: string };

  const orderRows = (orders ?? []) as Order[];
  const logRows   = (logs ?? []) as Log[];

  const confirmed    = logRows.filter((l) => l.disposition === "confirmed").length;
  const deliveredPaid = orderRows.filter((o) => o.status === "paid").length;
  const commission   = deliveredPaid * 3;

  const availColor = {
    available: "bg-green-100 text-green-700",
    in_call:   "bg-blue-100 text-blue-700",
    away:      "bg-amber-100 text-amber-700",
    offline:   "bg-gray-100 text-gray-600",
  }[a.availability_status ?? "offline"] ?? "bg-gray-100 text-gray-600";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/admin/call-center/agents"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Agents
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium">{a.full_name}</span>
      </div>

      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary">
          {a.full_name[0]?.toUpperCase()}
        </div>
        <div>
          <h1 className="text-xl font-semibold">{a.full_name}</h1>
          <p className="text-sm text-muted-foreground">{a.email}</p>
        </div>
        <span className={cn("ml-auto inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", availColor)}>
          {a.availability_status ?? "offline"}
        </span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Assignées",    val: orderRows.length,  icon: Phone,         cls: "" },
          { label: "Appels",       val: logRows.length,    icon: Phone,         cls: "" },
          { label: "Confirmés",    val: confirmed,         icon: CheckCircle2,  cls: "text-green-700" },
          { label: "Livrés payés", val: deliveredPaid,     icon: Award,         cls: "text-emerald-700" },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">{k.label}</p>
            <p className={cn("text-2xl font-bold", k.cls)}>{k.val}</p>
          </div>
        ))}
      </div>

      {/* Commission */}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 px-5 py-4 flex items-center gap-3">
        <Award className="h-6 w-6 text-emerald-600 shrink-0" />
        <div>
          <p className="font-semibold text-emerald-800">Commission totale : {commission.toFixed(2)} MAD</p>
          <p className="text-xs text-emerald-700">{deliveredPaid} livrés × 3 MAD</p>
        </div>
      </div>

      {/* Recent orders */}
      {orderRows.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b font-semibold text-sm">Commandes récentes</div>
          <div className="divide-y max-h-64 overflow-y-auto">
            {orderRows.map((o) => (
              <div key={o.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="font-mono">{o.order_number}</span>
                <span className="text-muted-foreground text-xs">{o.status}</span>
                <span className="font-mono text-xs">{o.total_amount_mad} MAD</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent call logs */}
      {logRows.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b font-semibold text-sm">Appels récents</div>
          <div className="divide-y max-h-64 overflow-y-auto">
            {logRows.map((l) => (
              <div key={l.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="font-mono text-xs text-muted-foreground">
                  {new Date(l.created_at).toLocaleDateString("fr-MA")}
                </span>
                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold",
                  l.disposition === "confirmed" ? "bg-green-100 text-green-700" :
                  l.disposition === "refused" ? "bg-red-100 text-red-700" :
                  "bg-gray-100 text-gray-600")}>
                  {l.disposition}
                </span>
                <span className="text-xs text-muted-foreground">
                  {l.duration_seconds ? `${l.duration_seconds}s` : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
