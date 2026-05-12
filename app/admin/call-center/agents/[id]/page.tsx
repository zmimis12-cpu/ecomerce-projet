import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Phone, Award } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: `Agent — Call Center` };
}

function mad(n: number) {
  return n.toLocaleString("fr-MA", { minimumFractionDigits: 2 }) + " MAD";
}

export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole(["super_admin", "admin", "manager"]);

  const { data: agentData } = await supabaseAdmin
    .from("call_center_agents")
    .select("user_id, display_name, active, availability_status, commission_per_delivered")
    .eq("user_id", id)
    .maybeSingle();

  if (!agentData) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <Link href="/admin/call-center/agents" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Agents
        </Link>
        <div className="rounded-xl border bg-card flex flex-col items-center justify-center py-20">
          <p className="text-lg font-semibold">Agent introuvable</p>
          <p className="text-sm text-muted-foreground mt-1">
            Cet agent n&apos;existe pas ou a été désactivé.
          </p>
          <Link href="/admin/call-center/agents" className="mt-4 text-sm text-primary hover:underline">
            ← Retour à la liste
          </Link>
        </div>
      </div>
    );
  }

  const agent = agentData as {
    user_id: string;
    display_name: string | null;
    active: boolean;
    availability_status: string | null;
    commission_per_delivered: number;
  };

  const { data: user } = await supabaseAdmin
    .from("users")
    .select("id, email, full_name, role, is_active")
    .eq("id", agent.user_id)
    .single();

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <Link href="/admin/call-center/agents" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Agents
        </Link>
        <div className="rounded-xl border bg-card flex flex-col items-center justify-center py-20">
          <p className="text-lg font-semibold">Utilisateur introuvable</p>
          <p className="text-sm text-muted-foreground mt-1">
            Le compte utilisateur de cet agent n&apos;existe plus.
          </p>
          <Link href="/admin/call-center/agents" className="mt-4 text-sm text-primary hover:underline">
            ← Retour à la liste
          </Link>
        </div>
      </div>
    );
  }

  const u = user as {
    id: string;
    email: string;
    full_name: string;
    role: string;
    is_active: boolean;
  };

  const [{ data: orders }, { data: logs }, { data: payments }] = await Promise.all([
    supabaseAdmin.from("orders").select("id, status, total_amount_mad").eq("assigned_to", u.id),
    supabaseAdmin
      .from("call_logs")
      .select("id, disposition, duration_seconds, created_at, notes")
      .eq("agent_id", u.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabaseAdmin
      .from("call_center_agent_payments")
      .select("*")
      .eq("agent_id", u.id)
      .order("period_start", { ascending: false }),
  ]);

  const orderRows = (orders ?? []) as {
    id: string;
    status: string;
    total_amount_mad: number;
  }[];

  const logRows = (logs ?? []) as {
    id: string;
    disposition: string;
    duration_seconds: number | null;
    created_at: string;
    notes: string | null;
  }[];

  const paymentRows = (payments ?? []) as {
    id: string;
    period_start: string;
    period_end: string;
    delivered_paid_count: number;
    gross_amount: number;
    paid_amount: number;
    remaining_amount: number;
    status: string;
    paid_at: string | null;
    notes: string | null;
  }[];

  const totalAssigned = orderRows.length;
  const confirmed = logRows.filter((l) => l.disposition === "confirmed").length;
  const deliveredPaid = orderRows.filter((o) =>
    ["delivered", "paid"].includes(o.status)
  ).length;
  const commissionEarned = deliveredPaid * (agent.commission_per_delivered ?? 3);
  const totalPaid = paymentRows.reduce((s, p) => s + p.paid_amount, 0);
  const callsMade = logRows.length;
  const confirmationRate =
    callsMade === 0 ? 0 : Math.round((confirmed / callsMade) * 100);

  const availLabel: Record<string, string> = {
    available: "Disponible",
    in_call: "En appel",
    away: "Absent",
    offline: "Hors ligne",
  };

  const DISPOSITION_LABEL: Record<string, string> = {
    confirmed: "✅ Confirmé",
    refused: "❌ Refusé",
    no_answer: "📵 Sans réponse",
    unreachable: "📵 Injoignable",
    wrong_number: "❌ Mauvais numéro",
    callback_requested: "🔄 Rappel",
    fake_order: "🚫 Fausse commande",
    duplicate: "⚠️ Doublon",
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link
          href="/admin/call-center/agents"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Agents
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium">
          {agent.display_name ?? u.full_name}
        </span>
      </div>

      {/* Header */}
      <div className="rounded-xl border bg-card p-5 flex items-center gap-4">
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <span className="text-lg font-bold text-primary">
            {(agent.display_name ?? u.full_name).charAt(0).toUpperCase()}
          </span>
        </div>
        <div>
          <h1 className="text-lg font-semibold">
            {agent.display_name ?? u.full_name}
          </h1>
          <p className="text-sm text-muted-foreground">{u.email}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
              agent.availability_status === "available"
                ? "bg-green-100 text-green-700"
                : agent.availability_status === "in_call"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-gray-100 text-gray-600"
            )}
          >
            {availLabel[agent.availability_status ?? "offline"] ?? "Hors ligne"}
          </span>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Commandes assignées", value: totalAssigned, cls: "" },
          { label: "Appels", value: callsMade, cls: "" },
          { label: "Confirmés", value: confirmed, cls: "text-green-700" },
          { label: "Livrés payés", value: deliveredPaid, cls: "text-emerald-700" },
          {
            label: "Taux confirmation",
            value: `${confirmationRate}%`,
            cls: confirmationRate >= 50 ? "text-green-700" : "text-amber-600",
          },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">{k.label}</p>
            <p className={cn("text-2xl font-bold", k.cls)}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Commission card */}
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Award className="h-4 w-4 text-amber-500" /> Commissions
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                label: "Commission / livraison",
                value: mad(agent.commission_per_delivered ?? 3),
              },
              {
                label: "Total gagné",
                value: mad(commissionEarned),
                cls: "text-emerald-700",
              },
              {
                label: "Total payé",
                value: mad(totalPaid),
                cls: "text-green-700",
              },
              {
                label: "Restant dû",
                value: mad(commissionEarned - totalPaid),
                cls:
                  commissionEarned - totalPaid > 0
                    ? "text-amber-700"
                    : "text-green-700",
              },
            ].map((k) => (
              <div key={k.label} className="rounded-lg bg-secondary/30 p-3">
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className={cn("text-sm font-bold font-mono mt-0.5", k.cls)}>
                  {k.value}
                </p>
              </div>
            ))}
          </div>

          {paymentRows.length > 0 && (
            <div className="pt-3 border-t">
              <p className="text-xs font-semibold text-muted-foreground mb-2">
                Historique paiements
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {paymentRows.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between text-xs bg-secondary/20 rounded-lg px-3 py-2"
                  >
                    <span className="font-mono">
                      {p.period_start} → {p.period_end}
                    </span>
                    <span className="font-mono font-semibold">
                      {mad(p.paid_amount)}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        p.status === "paid"
                          ? "bg-green-100 text-green-700"
                          : "bg-amber-100 text-amber-700"
                      )}
                    >
                      {p.status === "paid" ? "Payé" : "Partiel"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Recent calls */}
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Phone className="h-4 w-4" /> Appels récents
          </h2>
          {logRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Aucun appel.
            </p>
          ) : (
            <div className="divide-y max-h-80 overflow-y-auto">
              {logRows.slice(0, 20).map((l) => (
                <div key={l.id} className="flex items-center gap-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      {DISPOSITION_LABEL[l.disposition] ?? l.disposition}
                    </p>
                    {l.notes && (
                      <p className="text-xs text-muted-foreground truncate">
                        {l.notes}
                      </p>
                    )}
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