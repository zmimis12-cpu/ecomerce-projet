"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { FileDown, RefreshCw, Loader2, Printer, ClipboardList } from "lucide-react";
import { downloadBatchLabels, syncBatchStatuses } from "@/lib/delivery/batch/actions";
import { getLabelsByTrackings } from "@/lib/delivery/document-actions";
import { getBatchRecap, type BatchRecap } from "@/lib/delivery/recap-actions";

interface Props {
  batchId:       string;
  status:        string;
  paymentStatus: string;
  trackings:     string[];
}

function downloadBlob(b64: string, name: string) {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([buf], { type: "application/pdf" }));
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  URL.revokeObjectURL(url);
}

// ── Open recap in a printable window ─────────────────────────────────────────
function openRecapWindow(recap: BatchRecap) {
  const date = new Date(recap.created_at).toLocaleDateString("fr-MA", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const rows = recap.products.map((p) => `
    <tr>
      <td class="rank">${p.rank}</td>
      <td class="name">${p.product_name}</td>
      <td class="sku">${p.sku ?? "—"}</td>
      <td class="qty">×${p.total_quantity}</td>
      <td class="orders">${p.order_count} cmd</td>
    </tr>
  `).join("");

  const html = `<!DOCTYPE html><html lang="fr"><head>
<meta charset="UTF-8">
<title>Récap — ${recap.batch_number}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; padding: 20mm; color: #111; }
  .header { border-bottom: 3px solid #111; padding-bottom: 12px; margin-bottom: 20px; }
  .header h1 { font-size: 22px; font-weight: 900; }
  .header p { font-size: 13px; color: #555; margin-top: 4px; }
  .meta { display: flex; gap: 32px; margin-bottom: 20px; }
  .meta-item { }
  .meta-item .label { font-size: 10px; text-transform: uppercase; color: #888; letter-spacing: 0.05em; }
  .meta-item .value { font-size: 16px; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; }
  thead th { background: #111; color: #fff; padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
  tbody tr { border-bottom: 1px solid #e5e5e5; }
  tbody tr:nth-child(even) { background: #f9f9f9; }
  tbody tr:first-child td { font-weight: 900; font-size: 15px; }
  td { padding: 10px 12px; font-size: 13px; vertical-align: middle; }
  .rank { width: 40px; font-weight: 700; color: #888; text-align: center; }
  .name { font-weight: 600; }
  .sku { color: #777; font-family: monospace; font-size: 11px; }
  .qty { font-size: 18px; font-weight: 900; color: #111; text-align: center; }
  .orders { color: #666; text-align: center; font-size: 12px; }
  .footer { margin-top: 24px; font-size: 11px; color: #888; text-align: right; }
  @media print {
    body { padding: 10mm; }
    @page { margin: 10mm; }
  }
</style>
</head><body>
<div class="header">
  <h1>📦 Récapitulatif produits à préparer</h1>
  <p>${recap.batch_number} — ${recap.store_name ?? ""} · ${recap.shipping_company ?? "Digylog"} · ${date}</p>
</div>
<div class="meta">
  <div class="meta-item"><div class="label">Commandes</div><div class="value">${recap.total_orders}</div></div>
  <div class="meta-item"><div class="label">Unités totales</div><div class="value">${recap.total_units}</div></div>
  <div class="meta-item"><div class="label">Références</div><div class="value">${recap.products.length}</div></div>
</div>
<table>
  <thead>
    <tr>
      <th>#</th><th>Produit</th><th>SKU</th><th>Quantité</th><th>Commandes</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
<div class="footer">Imprimé le ${new Date().toLocaleString("fr-MA")}</div>
<script>window.onload = function() { window.print(); }</script>
</body></html>`;

  const w = window.open("", "_blank", "width=900,height=700");
  if (w) { w.document.write(html); w.document.close(); }
}

// ── Component ─────────────────────────────────────────────────────────────────
export function BatchDetailClient({ batchId, trackings }: Props) {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  type ActionRes = { ok?: boolean; success?: boolean; error?: string; blobBase64?: string };

  function run(label: string, fn: () => Promise<ActionRes>) {
    setMsg(null);
    startTransition(async () => {
      try {
        const res = await fn();
        if ((res.ok || res.success) && res.blobBase64) {
          downloadBlob(res.blobBase64, label);
          setMsg({ ok: true, text: `✓ ${label} téléchargé` });
        } else if (res.ok || res.success) {
          setMsg({ ok: true, text: "✓ Terminé" });
          setTimeout(() => window.location.reload(), 1000);
        } else {
          setMsg({ ok: false, text: res.error ?? "Erreur" });
        }
      } catch (e) {
        setMsg({ ok: false, text: String(e) });
      }
    });
  }

  function handleRecap() {
    setMsg(null);
    startTransition(async () => {
      const r = await getBatchRecap(batchId);
      if (r.ok && r.recap) {
        openRecapWindow(r.recap);
      } else {
        setMsg({ ok: false, text: r.error ?? "Erreur recap" });
      }
    });
  }

  const BtnCls = "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors hover:bg-secondary/60 disabled:opacity-50";

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Actions — Tickets</h3>
        {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      <div className="flex flex-wrap gap-2">
        {/* Récap produits — opens printable window */}
        <button type="button" disabled={isPending}
          onClick={handleRecap}
          className={`${BtnCls} border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100`}>
          <ClipboardList className="h-3.5 w-3.5" />
          Récap produits (imprimer)
        </button>

        {/* Download tickets sorted by product priority */}
        <button type="button" disabled={isPending || trackings.length === 0}
          onClick={() => run(
            `tickets-${batchId}.pdf`,
            () => trackings.length > 0
              ? getLabelsByTrackings(trackings, 3)
              : downloadBatchLabels(batchId)
          )}
          className={`${BtnCls} bg-primary text-primary-foreground border-primary hover:opacity-90`}>
          <Printer className="h-3.5 w-3.5" />
          Tickets 10×10 ({trackings.length})
        </button>

        {/* Sync Digylog statuses */}
        <button type="button" disabled={isPending}
          onClick={() => run("sync", () => syncBatchStatuses(batchId) as Promise<ActionRes>)}
          className={BtnCls}>
          <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
          Sync statuts
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        BL du jour →{" "}
        <Link href="/admin/delivery/documents" className="text-primary underline">
          Documents
        </Link>
      </p>

      {msg && (
        <p className={`text-xs font-medium ${msg.ok ? "text-green-700" : "text-red-600"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
