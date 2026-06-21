import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { getAllAgentsCommissions } from "@/lib/call-center/agent-queries";
import { PayAgentButton } from "@/components/call-center/pay-agent-button";
import { Award, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Commissions Agents" };
export const dynamic = "force-dynamic";

export default async function CommissionsPage() {
  await requireRole(["super_admin", "admin", "manager"]);
  const agents = await getAllAgentsCommissions();

  function mad(n: number) { return n.toLocaleString("fr-MA", { minimumFractionDigits: 2 }) + " MAD"; }

  const totalRemaining = agents.reduce((s, a) => s + a.remaining, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Commissions Agents</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Basé sur commandes livrées et payées uniquement.
          </p>
        </div>
        {totalRemaining > 0 && (
          <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <p className="text-sm font-semibold text-amber-800">
              Total impayé : {mad(totalRemaining)}
            </p>
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-secondary/30">
              {["Agent", "Disponibilité", "Livrés payés", "Commission/cmd", "Total gagné", "Total payé", "Restant dû", "Action"].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {agents.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground text-sm">Aucun agent actif.</td></tr>
            )}
            {agents.map((a) => {
              const availColor = {
                available: "bg-green-100 text-green-700",
                in_call:   "bg-blue-100 text-blue-700",
                away:      "bg-amber-100 text-amber-700",
                offline:   "bg-gray-100 text-gray-600",
              }[a.availability_status ?? "offline"] ?? "bg-gray-100 text-gray-600";

              return (
                <tr key={a.id} className="hover:bg-secondary/20 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium">{a.full_name}</p>
                    <p className="text-xs text-muted-foreground">{a.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", availColor)}>
                      {a.availability_status ?? "offline"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-bold font-mono text-emerald-700">{a.deliveredPaid}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-muted-foreground">3 MAD</td>
                  <td className="px-4 py-3 font-mono font-semibold">{mad(a.earned)}</td>
                  <td className="px-4 py-3 font-mono text-green-700">{mad(a.totalPaid)}</td>
                  <td className="px-4 py-3">
                    <span className={cn("font-mono font-bold", a.remaining > 0 ? "text-amber-700" : "text-muted-foreground")}>
                      {mad(a.remaining)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {a.remaining > 0 && (
                      <PayAgentButton
                        agentId={a.id}
                        agentName={a.full_name}
                        remaining={a.remaining}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
