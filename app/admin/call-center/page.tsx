import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAgentStats } from "@/lib/call-center/queries";
import { AgentsTable } from "@/components/call-center/agents-table";
import { AgentPresence } from "@/components/call-center/agent-presence";
import {
  Phone, PhoneCall, PhoneOff, PhoneMissed,
  Users, ListTodo, Award, CalendarClock, UserCheck,
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
      .select("id, agent_id, disposition")
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

  const assigned   = orders.filter((o) => o.assigned_to).length;
  const unassigned = orders.filter((o) => !o.assigned_to).length;
  const confirmed  = orders.filter((o) => o.call_status === "confirmed").length;
  const refused    = orders.filter((o) => o.call_status === "refused").length;
  const noAnswer   = orders.filter((o) => o.call_status === "no_answer").length;
  const paid       = orders.filter((o) => o.status === "paid").length;
  const confRate   = assigned === 0 ? 0 : Math.round((confirmed / assigned) * 100);

  const todayConfirmed = logs.filter((l) => l.disposition === "confirmed").length;
  const todayRefused   = logs.filter((l) => l.disposition === "refused").length;
  const todayNoAnswer  = logs.filter((l) => l.disposition === "no_answer").length;
  const todayCalls     = logs.length;

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

        {/* Orders KPIs */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Commandes</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Kpi icon={<Phone className="h-4 w-4"/>}       label="Total"         value={orders.length} />
            <Kpi icon={<PhoneCall className="h-4 w-4"/>}   label="Assignées"     value={assigned} />
            <Kpi icon={<PhoneMissed className="h-4 w-4"/>} label="Non assignées" value={unassigned} warn={unassigned > 0} />
            <Kpi icon={<PhoneCall className="h-4 w-4"/>}   label="Confirmées"    value={confirmed} positive />
            <Kpi icon={<PhoneOff className="h-4 w-4"/>}    label="Refusées"      value={refused} negative />
            <Kpi icon={<PhoneCall className="h-4 w-4"/>}   label="Taux conf."    value={`${confRate}%`}
              positive={confRate >= 50} negative={confRate < 30} />
          </div>
        </div>

        {/* Today KPIs */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Aujourd&apos;hui</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Kpi icon={<Phone className="h-4 w-4"/>}          label="Appels"        value={todayCalls} />
            <Kpi icon={<PhoneCall className="h-4 w-4"/>}      label="Confirmés"     value={todayConfirmed} positive />
            <Kpi icon={<PhoneOff className="h-4 w-4"/>}       label="Refusés"       value={todayRefused} negative={todayRefused > 0} />
            <Kpi icon={<CalendarClock className="h-4 w-4"/>}  label="Rappels dus"   value={cbCount} warn={cbCount > 0} />
          </div>
        </div>

        {/* Agents table */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Performance agents</p>
          <AgentsTable agents={agents} />
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
