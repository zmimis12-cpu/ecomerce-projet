"use client";
import { useState, useTransition } from "react";
import { FileDown, RefreshCw, CheckCircle, Loader2 } from "lucide-react";
import {
  downloadBatchLabels, downloadBatchBl, syncBatchStatuses,
} from "@/lib/delivery/batch/actions";

interface Props {
  batchId:       string;
  blId:          number | null;
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

export function BatchDetailClient({ batchId, blId, trackings }: Props) {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function run(label: string, fn: () => Promise<{ ok?: boolean; success?: boolean; error?: string; blobBase64?: string }>) {
    setMsg(null);
    startTransition(async () => {
      try {
        const res = await fn();
        if ((res.ok || res.success) && res.blobBase64) {
          downloadBlob(res.blobBase64, label);
          setMsg({ ok: true, text: `✓ ${label} téléchargé` });
        } else if (res.ok || res.success) {
          setMsg({ ok: true, text: "✓ Synchronisation terminée" });
        } else {
          setMsg({ ok: false, text: res.error ?? "Erreur" });
        }
      } catch (e) {
        setMsg({ ok: false, text: String(e) });
      }
    });
  }

  const BtnCls = "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors hover:bg-secondary/60 disabled:opacity-50";

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Actions</h3>
        {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      <div className="flex flex-wrap gap-2">
        {/* Download labels */}
        <button type="button" disabled={isPending || trackings.length === 0}
          onClick={() => run(`tickets-${batchId}.pdf`, () => downloadBatchLabels(batchId))}
          className={BtnCls}>
          <FileDown className="h-3.5 w-3.5" />
          Tickets 10×10 ({trackings.length})
        </button>

        {/* Download BL */}
        {blId ? (
          <button type="button" disabled={isPending}
            onClick={() => run(`bl-${blId}.pdf`, () => downloadBatchBl(batchId))}
            className={BtnCls}>
            <FileDown className="h-3.5 w-3.5" />
            Télécharger BL #{blId}
          </button>
        ) : (
          <span className={`${BtnCls} opacity-40 cursor-not-allowed`}>
            <FileDown className="h-3.5 w-3.5" />
            BL non disponible
          </span>
        )}

        {/* Sync statuses */}
        <button type="button" disabled={isPending}
          onClick={() => run("sync", () => syncBatchStatuses(batchId) as Promise<{ok?: boolean; success?: boolean; error?: string; blobBase64?: string}>)}
          className={BtnCls}>
          <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
          Sync statuts Digylog
        </button>

        {/* Export CSV */}
        <a href={`/api/delivery/batches/${batchId}/export`}
          className={BtnCls}>
          <CheckCircle className="h-3.5 w-3.5" />
          Export CSV
        </a>
      </div>

      {msg && (
        <p className={`text-xs font-medium ${msg.ok ? "text-green-700" : "text-red-600"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
