import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { CallResultBadge } from "@/components/call-center/call-result-badge";
import { StatusBadge } from "@/components/orders/status-badge";
import type { OrderStatus } from "@/types/orders";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Agent — Call Center" };
}

export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole(["super_admin", "admin", "manager"]);
  const supabase = await createClient();

  const { data: agent } = await supabase
    .from("users")
    .select("id, full_name, email, role, is_active")
    .eq("id", id)
    .single();

  if (!agent) notFound();
  const a = agent as unknown as { id: string; full_name: string; email: string; role: string; is_active: boolean };

  // Recent call logs
  const { data: logs } = await supabase
    .from("call_logs")
    .select("id, order_id, disposition, duration_seconds, notes, call_started_at, created_at")
    .eq("agent_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  // Assigned orders
  const { data: orders } = await supabase
    .from("orders")
    .select("id, order_number, customer_name, customer_phone, status, call_status, call_attempts, last_call_at")
    .eq("assigned_to", id)
    .order("created_at", { ascending: false })
    .limit(50);

  const logRows    = (logs   ?? []) as unknown as { id: string; order_id: string; disposition: string; duration_seconds: number | null; notes: string | null; call_started_at: string | null; created_at: string }[];
  const orderRows  = (orders ?? []) as unknown as { id: string; order_number: string; customer_name: string; customer_phone: string; status: string; call_status: string | null; call_attempts: number; last_call_at: string | null }[];

  const confirmed  = logRows.filter((l) => l.disposition === "confirmed").length;
  const refused    = logRows.filter((l) => l.disposition === "refused").length;
  const no_answer  = logRows.filter((l) => l.disposition === "no_answer").length;
  const rate       = logRows.length === 0 ? 0 : Math.round((confirmed / logRows.length) * 100);
  const durations  = logRows.map((l) => l.duration_seconds).filter((d): d is number => d !== null);
  const avgDur     = durations.length > 0 ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length) : null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/admin/call-center/agents"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="h-4 w-4" /> Agents
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium">{a.full_name}</span>
      </div>

      {/* Agent header */}
      <div className="rounded-xl border bg-card p-5 flex items-center gap-4">
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <span className="text-lg font-bold text-primary">{a.full_name.charAt(0).toUpperCase()}</span>
        </div>
        <div>
          <h1 className="text-lg font-semibold">{a.full_name}</h1>
          <p className="text-sm text-muted-foreground">{a.email}</p>
        </div>
        <span className={`ml-auto inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${a.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
          {a.is_active ? "Actif" : "Inactif"}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Appels total", value: logRows.length, color: "" },
          { label: "Confirmés",    value: confirmed,       color: "text-green-600" },
          { label: "Refusés",      value: refused,         color: "text-red-600" },
          { label: "Sans réponse", value: no_answer,       color: "text-orange-600" },
          { label: "Taux confir.", value: `${rate}%`,      color: rate >= 50 ? "text-green-600" : "text-red-600" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-xl font-bold font-mono mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Assigned orders */}
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="text-sm font-semibold">Commandes assignées ({orderRows.length})</h3>
          {orderRows.length === 0
            ? <p className="text-xs text-muted-foreground">Aucune commande.</p>
            : (
              <div className="divide-y max-h-80 overflow-y-auto">
                {orderRows.map((o) => (
                  <div key={o.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div>
                      <Link href={`/admin/call-center/orders/${o.id}`}
                        className="text-xs font-mono font-medium hover:underline">{o.order_number}</Link>
                      <p className="text-xs text-muted-foreground">{o.customer_name} · {o.customer_phone}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge status={o.status as OrderStatus} />
                      {o.call_status && <CallResultBadge result={o.call_status} />}
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>

        {/* Call history */}
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="text-sm font-semibold">Historique appels ({logRows.length})</h3>
          {avgDur !== null && (
            <p className="text-xs text-muted-foreground">Durée moyenne : <span className="font-mono font-medium">{avgDur}s</span></p>
          )}
          {logRows.length === 0
            ? <p className="text-xs text-muted-foreground">Aucun appel.</p>
            : (
              <div className="divide-y max-h-80 overflow-y-auto">
                {logRows.map((l) => (
                  <div key={l.id} className="py-2.5 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <CallResultBadge result={l.disposition} />
                      {l.notes && <p className="text-xs text-muted-foreground mt-0.5 truncate">{l.notes}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      {l.duration_seconds !== null && (
                        <p className="text-xs font-mono">{l.duration_seconds}s</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {new Date(l.created_at).toLocaleDateString("fr-MA")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
