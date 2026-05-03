import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import {
  getSyncLogs, getWebhookLogs,
  getAutomationSummary, getPendingSyncOrders,
} from "@/lib/automation/queries";
import { SyncLogTable } from "@/components/automation/sync-log-table";
import { RetryAllButton } from "@/components/automation/retry-all-button";
import { cn } from "@/lib/utils";
import {
  CheckCircle2, XCircle, RefreshCw, Zap, AlertTriangle
} from "lucide-react";

export const metadata: Metadata = { title: "Automation" };
export const dynamic = "force-dynamic";

export default async function AutomationPage() {
  await requireRole(["super_admin", "admin", "manager"]);

  const [syncLogs, webhookLogs, summary, pendingOrders] = await Promise.all([
    getSyncLogs(50),
    getWebhookLogs(20),
    getAutomationSummary(),
    getPendingSyncOrders(20),
  ]);

  const sheetsConfigured = !!(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_PRIVATE_KEY &&
    process.env.GOOGLE_SHEET_ID_CONFIRMED
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Automation</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Synchronisation Google Sheets et logs d&apos;événements.
          </p>
        </div>
        <RetryAllButton />
      </div>

      {/* Config warning */}
      {!sheetsConfigured && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-900 text-sm">Google Sheets non configuré</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Ajoutez <code className="font-mono bg-amber-100 px-1 rounded">GOOGLE_SERVICE_ACCOUNT_EMAIL</code>,{" "}
              <code className="font-mono bg-amber-100 px-1 rounded">GOOGLE_PRIVATE_KEY</code> et{" "}
              <code className="font-mono bg-amber-100 px-1 rounded">GOOGLE_SHEET_ID_CONFIRMED</code>{" "}
              dans vos variables d&apos;environnement Vercel.
            </p>
          </div>
        </div>
      )}

      {/* KPI cards — last 7 days */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Syncs (7j)" value={summary.sync.total} icon={<RefreshCw className="h-4 w-4" />} />
        <KpiCard label="Succès" value={summary.sync.success} icon={<CheckCircle2 className="h-4 w-4" />} positive />
        <KpiCard label="Échecs" value={summary.sync.failed} icon={<XCircle className="h-4 w-4" />} negative={summary.sync.failed > 0} />
        <KpiCard label="Événements" value={summary.webhooks.total} icon={<Zap className="h-4 w-4" />} />
      </div>

      {/* Pending / failed orders */}
      {pendingOrders.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-amber-900">
            Commandes à synchroniser ({pendingOrders.length})
          </h3>
          <div className="divide-y divide-amber-200">
            {pendingOrders.map((o) => (
              <div key={o.id} className="flex items-center gap-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <span className="font-mono text-xs font-medium">{o.order_number}</span>
                  <span className="text-xs text-muted-foreground ml-2">{o.customer_name}</span>
                </div>
                <span className="text-xs font-medium text-amber-700">
                  {o.sync_status ?? "pending"}
                </span>
                {o.sync_error && (
                  <span className="text-xs text-red-600 truncate max-w-[160px]" title={o.sync_error}>
                    {o.sync_error}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sync logs */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold">Logs de synchronisation (50 derniers)</h2>
        <SyncLogTable logs={syncLogs} />
      </div>

      {/* Webhook logs */}
      {webhookLogs.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Événements webhook (20 derniers)</h2>
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-secondary/30">
                    {["Événement","Statut","Durée","Date"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {webhookLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-secondary/20">
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-xs bg-secondary px-1.5 py-0.5 rounded">{log.event_type}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        {log.status === "success"
                          ? <span className="text-xs text-green-600 font-medium">✓ Succès</span>
                          : <span className="text-xs text-red-600 font-medium">✕ {log.error ?? "Échec"}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono">
                        {log.duration_ms !== null ? `${log.duration_ms}ms` : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString("fr-MA")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, icon, positive, negative }: {
  label: string; value: number; icon: React.ReactNode;
  positive?: boolean; negative?: boolean;
}) {
  return (
    <div className={cn(
      "rounded-xl border bg-card p-4 space-y-2",
      positive && "border-green-200 bg-green-50/40",
      negative && "border-red-200 bg-red-50/40"
    )}>
      <div className={cn(
        "text-muted-foreground",
        positive && "text-green-600",
        negative && "text-red-500"
      )}>{icon}</div>
      <p className={cn(
        "text-xl font-bold font-mono",
        positive && "text-green-700",
        negative && "text-red-600"
      )}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
