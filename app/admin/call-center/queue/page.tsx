import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Phone, CalendarClock, Clock } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getCallCenterOrders } from "@/lib/call-center/queries";
import { CCOrdersTable } from "@/components/call-center/cc-orders-table";
import { getAgents } from "@/lib/orders/queries";
import { hasRole } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "File d&apos;appels" };
export const dynamic = "force-dynamic";

export default async function QueuePage() {
  const session   = await requireRole(["super_admin","admin","manager","call_center_agent"]);
  const isAgent   = session.role === "call_center_agent";
  const canManage = hasRole(session.role, ["super_admin","admin","manager"]);

  // Queue = pending calls + no_answer (need callback) assigned to this agent
  const [orders, agents] = await Promise.all([
    getCallCenterOrders({
      isAgent,
      authId: session.authId,
      callStatus: undefined, // all pending statuses
    }),
    canManage ? getAgents() : Promise.resolve([]),
  ]);

  // Filter: queue = only actionable orders (not confirmed/refused/cancelled)
  const queue = orders.filter((o) =>
    !["confirmed", "refused", "cancelled", "returned", "paid", "delivered"].includes(o.status)
  );

  // Callbacks due in next 24h
  const in24h = new Date(Date.now() + 24 * 60 * 60 * 1000);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 flex-wrap">
        {canManage && (
          <Link href="/admin/call-center"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-4 w-4" /> Call Center
          </Link>
        )}
        <div className="flex-1">
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Phone className="h-5 w-5 text-primary" />
            File d&apos;appels
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Commandes à appeler maintenant — {queue.length} en attente.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "À appeler",    val: queue.filter((o) => !o.call_attempts || o.call_attempts === 0).length, icon: Phone,         cls: "text-primary" },
          { label: "Sans réponse", val: queue.filter((o) => o.status === "no_answer").length,                   icon: Clock,         cls: "text-orange-600" },
          { label: "Rappels dus",  val: queue.filter((o) => o.last_call_at && new Date(o.last_call_at) <= in24h).length, icon: CalendarClock, cls: "text-amber-600" },
          { label: "Total queue",  val: queue.length,                                                            icon: Phone,         cls: "" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <s.icon className={cn("h-4 w-4 shrink-0", s.cls || "text-muted-foreground")} />
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
            <p className={cn("text-2xl font-bold", s.cls)}>{s.val}</p>
          </div>
        ))}
      </div>

      <CCOrdersTable
        orders={queue}
        agents={canManage ? (agents as { id: string; full_name: string }[]) : []}
        canManage={canManage}
        mode="queue"
      />
    </div>
  );
}
