"use client";
import { useState, useTransition } from "react";
import {
  sendBatchToDigylog, downloadBatchLabels,
  downloadBatchBl, syncBatchStatuses,
} from "@/lib/delivery/batch/actions";
import { Send, FileDown, RefreshCw, AlertTriangle, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type BatchOrderRow = {
  id: string; tracking_number: string | null; status: string; error_message: string | null;
  orders: {
    id: string; order_number: string; customer_name: string; customer_phone: string;
    customer_city: string; total_amount_mad: number;
    delivery_external_status: string | null; delivery_status: string | null;
    order_items: { quantity: number; products: { name: string; sku: string } | null }[];
  } | null;
};

function downloadPdf(b64: string, name: string) {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([buf], { type:"application/pdf" }));
  Object.assign(document.createElement("a"), { href:url, download:name }).click();
  URL.revokeObjectURL(url);
}

interface Props {
  batchId:     string;
  batchStatus: string;
  blId:        number | null;
  orders:      BatchOrderRow[];
}

export function BatchDetailClient({ batchId, batchStatus, blId, orders }: Props) {
  const [isPending, startTransition] = useTransition();
  const [actionMsg, setMsg] = useState<{ type:"ok"|"warn"|"err"; text: string } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  function run(fn: () => Promise<void>) {
    setMsg(null); setErrors([]);
    startTransition(fn);
  }

  const hasPending = orders.some((o) => o.status === "pending");
  const hasSent    = orders.some((o) => o.status === "sent" && o.tracking_number);
  const canSend    = hasPending;
  const canLabels  = hasSent;
  const canBl      = !!blId;
  const canSync    = hasSent;

  const STATUS_ROW = {
    pending: { cls:"bg-gray-100 text-gray-600", label:"En attente" },
    sent:    { cls:"bg-green-100 text-green-800", label:"Envoyé" },
    failed:  { cls:"bg-red-100 text-red-800",     label:"Échec" },
  } as const;

  return (
    <div className="space-y-5">
      {/* Action buttons */}
      <section className="rounded-xl border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Actions</h2>

        {actionMsg && (
          <div className={cn("flex items-start gap-2 rounded-lg px-4 py-3 text-sm font-medium",
            actionMsg.type === "ok"   && "bg-green-600 text-white",
            actionMsg.type === "warn" && "bg-amber-100 text-amber-900 border border-amber-200",
            actionMsg.type === "err"  && "bg-red-100 text-red-800 border border-red-200",
          )}>
            {actionMsg.type === "ok" ? <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" /> : <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />}
            {actionMsg.text}
          </div>
        )}

        {errors.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-1">
            <p className="text-xs font-semibold text-red-800">Erreurs ({errors.length}) :</p>
            {errors.map((e, i) => (
              <p key={i} className="text-xs font-mono text-red-700">{e}</p>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {/* Send to Digylog */}
          <button type="button" disabled={isPending || !canSend}
            onClick={() => run(async () => {
              const r = await sendBatchToDigylog(batchId);
              if (r.success) {
                const msg = `✓ ${r.sent} commande(s) envoyée(s)${r.failed ? ` · ${r.failed} échoué(s)` : ""}${r.blId ? ` · BL #${r.blId}` : ""}`;
                setMsg({ type: r.failed ? "warn" : "ok", text: msg });
                if (r.errors?.length) setErrors(r.errors);
              } else {
                setMsg({ type:"err", text: r.error ?? "Erreur envoi Digylog" });
                if (r.errors?.length) setErrors(r.errors);
              }
            })}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
            <Send className={`h-4 w-4 ${isPending ? "animate-pulse" : ""}`} />
            {isPending ? "Envoi…" : "Envoyer à Digylog"}
          </button>

          {/* Download tickets */}
          <button type="button" disabled={isPending || !canLabels}
            onClick={() => run(async () => {
              const r = await downloadBatchLabels(batchId);
              if (r.ok && r.blobBase64) {
                downloadPdf(r.blobBase64, `tickets-${batchId.slice(0, 8)}.pdf`);
                setMsg({ type:"ok", text:"✓ Tickets 10×10 téléchargés" });
              } else {
                setMsg({ type:"err", text: r.error ?? "Erreur tickets" });
              }
            })}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm font-semibold hover:bg-secondary/70 disabled:opacity-50">
            <FileDown className="h-4 w-4" />
            Tickets 10×10
          </button>

          {/* Download BL */}
          <button type="button" disabled={isPending || !canBl}
            onClick={() => run(async () => {
              const r = await downloadBatchBl(batchId);
              if (r.ok && r.blobBase64) {
                downloadPdf(r.blobBase64, `bl-${r.blId}.pdf`);
                setMsg({ type:"ok", text:`✓ BL #${r.blId} téléchargé` });
              } else {
                setMsg({ type:"err", text: r.error ?? "Erreur BL" });
              }
            })}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm font-semibold hover:bg-secondary/70 disabled:opacity-50">
            <FileDown className="h-4 w-4" />
            {canBl ? `BL #${blId}` : "BL non disponible"}
          </button>

          {/* Sync statuses */}
          <button type="button" disabled={isPending || !canSync}
            onClick={() => run(async () => {
              const r = await syncBatchStatuses(batchId);
              if (r.success) {
                setMsg({ type:"ok", text:`✓ ${r.synced} statut(s) synchronisé(s)` });
              } else {
                setMsg({ type:"err", text: r.error ?? "Erreur sync" });
              }
            })}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm font-semibold hover:bg-secondary/70 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
            Sync statuts
          </button>
        </div>

        {!canSend && batchStatus === "sent" && (
          <p className="text-xs text-muted-foreground">
            Toutes les commandes ont été envoyées. Utilisez &ldquo;Sync statuts&rdquo; pour mettre à jour.
          </p>
        )}
        {!canBl && (
          <p className="text-xs text-muted-foreground">
            BL non disponible — le BL sera généré par Digylog lors de l&apos;envoi avec status=1.
          </p>
        )}
      </section>

      {/* Orders table */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Commandes du groupe ({orders.length})
        </h2>
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-secondary/30">
                  {["Commande","Client","Ville","Produits","Total","Tracking","Statut Digylog","Résultat"].map((h) => (
                    <th key={h} className="text-left px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {orders.map((bo) => {
                  const o = bo.orders;
                  if (!o) return null;
                  const rowCfg = STATUS_ROW[bo.status as keyof typeof STATUS_ROW] ?? STATUS_ROW.pending;
                  return (
                    <tr key={bo.id} className={cn(
                      "hover:bg-secondary/20 transition-colors",
                      bo.status === "failed" && "bg-red-50/30"
                    )}>
                      <td className="px-3 py-2.5 font-mono font-medium">{o.order_number}</td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium">{o.customer_name}</p>
                        <p className="text-muted-foreground">{o.customer_phone}</p>
                      </td>
                      <td className="px-3 py-2.5">{o.customer_city}</td>
                      <td className="px-3 py-2.5">
                        {o.order_items.map((item, i) => (
                          <span key={i} className="block">
                            {item.products?.name ?? "?"} ×{item.quantity}
                          </span>
                        ))}
                      </td>
                      <td className="px-3 py-2.5 font-mono font-semibold">
                        {o.total_amount_mad.toFixed(0)} MAD
                      </td>
                      <td className="px-3 py-2.5">
                        {bo.tracking_number
                          ? <span className="font-mono bg-secondary px-1.5 py-0.5 rounded">{bo.tracking_number}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {o.delivery_external_status ?? "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold", rowCfg.cls)}>
                          {rowCfg.label}
                        </span>
                        {bo.error_message && (
                          <p className="text-[10px] text-red-600 mt-0.5 max-w-[150px]">{bo.error_message}</p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
