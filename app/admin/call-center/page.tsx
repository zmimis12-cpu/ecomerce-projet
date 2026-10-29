import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAgentStats } from "@/lib/call-center/queries";
import { LiveAgentsTable } from "@/components/call-center/live-agents-table";
import { AgentPresence } from "@/components/call-center/agent-presence";
import {
  Phone, PhoneCall, PhoneOff, PhoneMissed,
  Users, ListTodo, Award, CalendarClock, UserCheck, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Vue globale Call Center" };
export const dynamic = "force-dynamic";

export default async function CallCenterPage() {
  const session = await requireRole(["super_admin", "admin", "manager", "call_center_agent"]);
  const isAgent = session.role === "call_center_agent";

  if (isAgent) {
    const { redirect } = await import("next/navigation");
    redirect("/admin/call-center/queue");
  }

  // Use supabaseAdmin to bypass RLS
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    { data: allOrders },
    { data: todayLogs },
    { data: callbacks },
    agents,
  ] = await Promise.all([
    supabaseAdmin.from("orders")
      .select("id, assigned_to, call_status, status")
      .not("status", "in", '("cancelled","returned")'),
    supabaseAdmin.from("call_logs")
      .select("id, agent_id, disposition, order_id")
      .gte("created_at", today.toISOString()),
    supabaseAdmin.from("orders")
      .select("id")
      .not("callback_scheduled_at", "is", null)
      .lte("callback_scheduled_at", new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()),
    getAgentStats(),
  ]);

  type O = { id: string; assigned_to: string | null; call_status: string | null; status: string };
  type L = { id: string; agent_id: string; disposition: string };

  const orders   = (allOrders ?? []) as O[];
  const logs     = (todayLogs ?? []) as L[];
  const cbCount  = (callbacks ?? []).length;

  // Chiffres exacts sur les COMMANDES traitées par le call center (mêmes définitions que le dashboard)
  const { agentRates, sumRates } = await import("@/lib/call-center/rates");
  const tot = sumRates(await agentRates(agents.map((a) => a.agent_id)));
  const unassigned = orders.filter((o) => !o.assigned_to && ["new", "pending", "no_answer", "confirmed"].includes(o.status)).length;

  // Aujourd'hui = commandes distinctes (pas le nombre d'appels)
  const distinct = (d: string) => new Set(logs.filter((l) => l.disposition === d).map((l) => (l as L & { order_id?: string }).order_id ?? l.id)).size;
  const todayConfirmed = distinct("confirmed");
  const todayRefused   = distinct("refused");
  const todayNoAnswer  = distinct("no_answer");
  const todayCalls     = new Set(logs.map((l) => (l as L & { order_id?: string }).order_id ?? l.id)).size;
  void todayNoAnswer;

  const agentsOnline  = agents.filter((a) => a.availability_status === "available").length;
  const agentsInCall  = agents.filter((a) => a.availability_status === "in_call").length;
  const totalComm     = agents.reduce((s, a) => s + (a.commission_mad ?? 0), 0);

  return (
    <>
      {isAgent && <AgentPresence />}
      <div className="space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Vue globale Call Center</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Suivi en temps réel des confirmations et de la performance agents.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/call-center/queue"
              className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-secondary transition-colors">
              <ListTodo className="h-4 w-4" /> File d&apos;appels
            </Link>
            <Link href="/admin/call-center/agents"
              className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-secondary transition-colors">
              <Users className="h-4 w-4" /> Agents
            </Link>
            <Link href="/admin/call-center/commissions"
              className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-secondary transition-colors">
              <Award className="h-4 w-4" /> Commissions
            </Link>
          </div>
        </div>

        {/* Agents availability */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Kpi icon={<Users className="h-4 w-4"/>}    label="Total agents"     value={agents.length} />
          <Kpi icon={<UserCheck className="h-4 w-4"/>} label="En ligne"         value={agentsOnline} positive />
          <Kpi icon={<Phone className="h-4 w-4"/>}    label="En appel"         value={agentsInCall} />
          <Kpi icon={<Award className="h-4 w-4"/>}    label="Commissions tot." value={`${totalComm.toFixed(0)} MAD`} />
        </div>

        {/* Orders KPIs — commandes assignées aux agents, depuis le début */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Commandes (call center, depuis le début)</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Kpi icon={<Phone className="h-4 w-4"/>}       label="Assignées"      value={tot.assigned} />
            <Kpi icon={<PhoneCall className="h-4 w-4"/>}   label="Traitées"       value={tot.treated} />
            <Kpi icon={<PhoneCall className="h-4 w-4"/>}   label="Confirmées"     value={tot.confirmed} positive />
            <Kpi icon={<PhoneCall className="h-4 w-4"/>}   label="Taux confirmation" value={`${tot.confirmRate}%`}
              positive={tot.confirmRate >= 75} negative={tot.confirmRate < 60} />
            <Kpi icon={<PhoneMissed className="h-4 w-4"/>} label="Sans réponse"   value={tot.noAnswer} warn={tot.noAnswer > 0} />
            <Kpi icon={<PhoneOff className="h-4 w-4"/>}    label="Refusées"       value={tot.refused} negative={tot.refused > 0} />
            <Kpi icon={<PhoneOff className="h-4 w-4"/>}    label="Annulées"       value={tot.cancelled} />
            <Kpi icon={<AlertTriangle className="h-4 w-4"/>} label="Fausses commandes" value={tot.fake} negative={tot.fake > 0} />
            <Kpi icon={<PhoneCall className="h-4 w-4"/>}   label="Expédiées"      value={tot.shipped} />
            <Kpi icon={<PhoneCall className="h-4 w-4"/>}   label="En route"       value={tot.inTransit} />
            <Kpi icon={<Award className="h-4 w-4"/>}       label="Livrées"        value={tot.delivered} positive />
            <Kpi icon={<Award className="h-4 w-4"/>}       label="Taux livraison" value={tot.delivered + tot.returned ? `${tot.deliveryRate}%` : "—"}
              positive={tot.deliveryRate >= 75} negative={tot.delivered + tot.returned > 0 && tot.deliveryRate < 60} />
            <Kpi icon={<PhoneMissed className="h-4 w-4"/>} label="Non assignées (à traiter)" value={unassigned} warn={unassigned > 0} />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">Taux confirmation = confirmées / traitées · Taux livraison = livrées / (livrées + retours), colis en route exclus.</p>
        </div>

        {/* Today KPIs */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Aujourd&apos;hui</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Kpi icon={<Phone className="h-4 w-4"/>}          label="Commandes appelées" value={todayCalls} />
            <Kpi icon={<PhoneCall className="h-4 w-4"/>}      label="Confirmées"    value={todayConfirmed} positive />
            <Kpi icon={<PhoneOff className="h-4 w-4"/>}       label="Refusées"      value={todayRefused} negative={todayRefused > 0} />
            <Kpi icon={<CalendarClock className="h-4 w-4"/>}  label="Rappels dus"   value={cbCount} warn={cbCount > 0} />
          </div>
        </div>

        {/* Agents table */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Performance agents</p>
          <LiveAgentsTable initialAgents={agents} />
        </div>

      </div>
    </>
  );
}

function Kpi({ label, value, icon, positive, negative, warn }: {
  label: string; value: string | number; icon: React.ReactNode;
  positive?: boolean; negative?: boolean; warn?: boolean;
}) {
  return (
    <div className={cn(
      "rounded-xl border bg-card p-4 space-y-2",
      positive && "border-green-200 bg-green-50/30",
      negative && "border-red-200 bg-red-50/30",
      warn    && "border-amber-200 bg-amber-50/30",
    )}>
      <div className={cn("text-muted-foreground",
        positive && "text-green-600",
        negative && "text-red-500",
        warn     && "text-amber-600",
      )}>{icon}</div>
      <p className={cn("text-xl font-bold font-mono",
        positive && "text-green-700",
        negative && "text-red-600",
        warn     && "text-amber-700",
      )}>{value}</p>
      <p className="text-xs text-muted-foreground leading-tight">{label}</p>
    </div>
  );
}
