"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { FileDown, RefreshCw, Loader2 } from "lucide-react";
import { downloadBatchLabels, syncBatchStatuses } from "@/lib/delivery/batch/actions";
import { getLabelsByTrackings } from "@/lib/delivery/document-actions";

interface Props {
  batchId:      string;
  status:       string;
  paymentStatus:string;
  trackings:    string[];
}

function downloadBlob(b64: string, name: string) {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([buf], { type: "application/pdf" }));
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  URL.revokeObjectURL(url);
}

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

  const BtnCls = "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors hover:bg-secondary/60 disabled:opacity-50";

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Actions — Tickets</h3>
        {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      <div className="flex flex-wrap gap-2">
        {/* Download tickets */}
        <button type="button" disabled={isPending || trackings.length === 0}
          onClick={() => run(
            `tickets-${batchId}.pdf`,
            () => trackings.length > 0
              ? getLabelsByTrackings(trackings, 3)
              : downloadBatchLabels(batchId)
          )}
          className={`${BtnCls} bg-primary text-primary-foreground border-primary hover:opacity-90`}>
          <FileDown className="h-3.5 w-3.5" />
          Tickets 10×10 ({trackings.length})
        </button>

        {/* Sync statuses */}
        <button type="button" disabled={isPending}
          onClick={() => run("sync", () => syncBatchStatuses(batchId) as Promise<ActionRes>)}
          className={BtnCls}>
          <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
          Sync statuts Digylog
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        Pour télécharger le BL du jour → <Link href="/admin/delivery/documents" className="text-primary underline">Documents → BL du jour</Link>
      </p>

      {msg && (
        <p className={`text-xs font-medium ${msg.ok ? "text-green-700" : "text-red-600"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
