import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { getCallCenterSummary, getAgentStats } from "@/lib/call-center/queries";
import { AgentsTable } from "@/components/call-center/agents-table";
import { hasRole } from "@/lib/auth/roles";
import { Phone, PhoneCall, PhoneOff, PhoneMissed, Users, ListTodo } from "lucide-react";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Call Center" };
export const dynamic = "force-dynamic";

export default async function CallCenterPage() {
  const session = await requireRole([
    "super_admin", "admin", "manager", "call_center_agent"
  ]);
  const isAgent   = session.role === "call_center_agent";
  const canManage = hasRole(session.role, ["super_admin", "admin", "manager"]);

  // Agent → redirect to their order list
  if (isAgent) {
    const { redirect } = await import("next/navigation");
    redirect("/admin/call-center/orders");
  }

  const [summary, agents] = await Promise.all([
    getCallCenterSummary(),
    getAgentStats(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Call Center</h1>
          <p className="text-sm text-muted-foreground mt-1">Suivi des confirmations et performance des agents.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/call-center/orders"
            className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-secondary transition-colors">
            <ListTodo className="h-4 w-4" /> Commandes
          </Link>
          <Link href="/admin/call-center/agents"
            className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-secondary transition-colors">
            <Users className="h-4 w-4" /> Agents
          </Link>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Total commandes"  value={summary.total}        icon={<Phone className="h-4 w-4" />} />
        <KpiCard label="Assignées"        value={summary.assigned}     icon={<PhoneCall className="h-4 w-4" />} />
        <KpiCard label="Non assignées"    value={summary.unassigned}   icon={<PhoneMissed className="h-4 w-4" />} warn={summary.unassigned > 0} />
        <KpiCard label="Confirmées"       value={summary.confirmed}    icon={<PhoneCall className="h-4 w-4" />} positive />
        <KpiCard label="Refusées"         value={summary.refused}      icon={<PhoneOff className="h-4 w-4" />} negative />
        <KpiCard label="Taux confirmation" value={`${summary.confirmation_rate}%`}
          icon={<PhoneCall className="h-4 w-4" />}
          positive={summary.confirmation_rate >= 50}
          negative={summary.confirmation_rate < 30} />
      </div>

      {/* Agents table */}
      <div>
        <h2 className="text-sm font-semibold mb-3">Performance des agents</h2>
        <AgentsTable agents={agents} />
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon, positive, negative, warn }: {
  label: string; value: string | number; icon: React.ReactNode;
  positive?: boolean; negative?: boolean; warn?: boolean;
}) {
  return (
    <div className={cn(
      "rounded-xl border bg-card p-4 space-y-2",
      positive && "border-green-200 bg-green-50/30",
      negative && "border-red-200 bg-red-50/30",
      warn && "border-amber-200 bg-amber-50/30"
    )}>
      <div className={cn(
        "text-muted-foreground",
        positive && "text-green-600",
        negative && "text-red-500",
        warn && "text-amber-600"
      )}>{icon}</div>
      <p className={cn(
        "text-xl font-bold font-mono",
        positive && "text-green-700",
        negative && "text-red-600",
        warn && "text-amber-700"
      )}>{value}</p>
      <p className="text-xs text-muted-foreground leading-tight">{label}</p>
    </div>
  );
}
