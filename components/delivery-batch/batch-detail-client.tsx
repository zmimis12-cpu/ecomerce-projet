"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { RefreshCw, Loader2, Printer } from "lucide-react";
import { generateRecapAndLabels, syncBatchStatuses } from "@/lib/delivery/batch/actions";

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

export function BatchDetailClient({ batchId, status, trackings }: Props) {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const alreadyPrinted = status === "tickets_printed";

  function handlePrint() {
    setMsg(null);
    startTransition(async () => {
      const r = await generateRecapAndLabels(batchId);
      if (r.ok && r.blobBase64) {
        downloadBlob(r.blobBase64, `recap-tickets-${batchId}.pdf`);
        setMsg({ ok: true, text: `✓ PDF — ${r.totalTrackings} tickets, ${r.productsFound ?? 0} produits` });
        setTimeout(() => window.location.reload(), 800);
      } else {
        setMsg({ ok: false, text: r.error ?? "Erreur" });
      }
    });
  }

  function handleSync() {
    setMsg(null);
    startTransition(async () => {
      const r = await syncBatchStatuses(batchId) as { ok?: boolean; success?: boolean; error?: string };
      if (r.ok || r.success) {
        setMsg({ ok: true, text: "✓ Statuts synchronisés" });
        setTimeout(() => window.location.reload(), 800);
      } else {
        setMsg({ ok: false, text: r.error ?? "Erreur sync" });
      }
    });
  }

  const BtnCls = "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50";

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Actions — Tickets</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Le PDF contiendra: récapitulatif produits + tickets 10×10
          </p>
        </div>
        {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      <div className="flex flex-wrap gap-2">
        {/* Main print button — generates recap + labels merged PDF */}
        <button type="button" disabled={isPending || trackings.length === 0}
          onClick={handlePrint}
          className={`${BtnCls} ${
            alreadyPrinted
              ? "border-dashed text-muted-foreground hover:text-foreground"
              : "bg-primary text-primary-foreground border-primary hover:opacity-90"
          }`}
          title={trackings.length === 0 ? "Aucun tracking disponible" : ""}>
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
          {alreadyPrinted
            ? `Réimprimer (${trackings.length} tickets)`
            : `Imprimer tickets (${trackings.length})`}
        </button>

        {/* Sync statuses */}
        <button type="button" disabled={isPending}
          onClick={handleSync}
          className={BtnCls}>
          <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
          Sync statuts Digylog
        </button>
      </div>

      {alreadyPrinted && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          ⚠ Ce batch est imprimé — les nouveaux syncs créent un nouveau batch.
        </p>
      )}

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
