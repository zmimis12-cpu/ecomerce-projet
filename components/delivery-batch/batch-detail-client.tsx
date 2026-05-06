"use client";
import { useState, useTransition } from "react";
import { FileDown, RefreshCw, Loader2, Send } from "lucide-react";
import {
  downloadBatchLabels, downloadBatchBl,
  syncBatchStatuses, sendBatchGetBl,
} from "@/lib/delivery/batch/actions";

interface Props {
  batchId:       string;
  blId:          number | null;
  status:        string;
  paymentStatus: string;
  trackings:     string[];
  totalOrders:   number;
}

function downloadBlob(b64: string, name: string) {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([buf], { type: "application/pdf" }));
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  URL.revokeObjectURL(url);
}

export function BatchDetailClient({
  batchId, blId: initialBlId, status, trackings
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg]   = useState<{ ok: boolean; text: string } | null>(null);
  const [blId, setBlId] = useState<number | null>(initialBlId);

  type ActionRes = { ok?: boolean; success?: boolean; error?: string; blobBase64?: string; bl?: number };

  function run(label: string, fn: () => Promise<ActionRes>) {
    setMsg(null);
    startTransition(async () => {
      try {
        const res = await fn();
        if ((res.ok || res.success) && res.blobBase64) {
          downloadBlob(res.blobBase64, label);
          setMsg({ ok: true, text: `✓ ${label} téléchargé` });
        } else if (res.bl) {
          setBlId(res.bl);
          setMsg({ ok: true, text: `✓ BL #${res.bl} obtenu — page en cours de mise à jour` });
          // Reload after 1.5s to refresh server data
          setTimeout(() => window.location.reload(), 1500);
        } else if (res.ok || res.success) {
          setMsg({ ok: true, text: "✓ Terminé" });
          setTimeout(() => window.location.reload(), 1500);
        } else {
          setMsg({ ok: false, text: res.error ?? "Erreur" });
        }
      } catch (e) {
        setMsg({ ok: false, text: String(e) });
      }
    });
  }

  const isDraft = status === "draft";
  const BtnCls  = "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors hover:bg-secondary/60 disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Actions</h3>
        {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      <div className="flex flex-wrap gap-2">

        {/* STEP 1: If draft (no BL yet) — show Send button */}
        {isDraft && trackings.length > 0 && (
          <button type="button" disabled={isPending}
            onClick={() => run("send", () => sendBatchGetBl(batchId) as Promise<ActionRes>)}
            className={`${BtnCls} bg-primary text-primary-foreground border-primary hover:bg-primary/90`}>
            <Send className="h-3.5 w-3.5" />
            Envoyer à Digylog → Obtenir BL
          </button>
        )}

        {/* Download labels */}
        <button type="button" disabled={isPending || trackings.length === 0}
          onClick={() => run(`tickets-${batchId}.pdf`, () => downloadBatchLabels(batchId))}
          className={BtnCls}
          title={trackings.length === 0 ? "Aucun tracking disponible" : ""}>
          <FileDown className="h-3.5 w-3.5" />
          Tickets 10×10 ({trackings.length})
        </button>

        {/* Download BL */}
        {blId ? (
          <button type="button" disabled={isPending}
            onClick={() => run(`BL-${blId}.pdf`, () => downloadBatchBl(batchId))}
            className={BtnCls}>
            <FileDown className="h-3.5 w-3.5" />
            BL #{blId}
          </button>
        ) : (
          <span className={`${BtnCls} opacity-40 cursor-not-allowed`}>
            <FileDown className="h-3.5 w-3.5" />
            BL non disponible
          </span>
        )}

        {/* Sync */}
        <button type="button" disabled={isPending}
          onClick={() => run("sync", () => syncBatchStatuses(batchId) as Promise<ActionRes>)}
          className={BtnCls}>
          <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
          Sync statuts
        </button>
      </div>

      {/* Message */}
      {msg && (
        <p className={`text-xs font-medium ${msg.ok ? "text-green-700" : "text-red-600"}`}>
          {msg.text}
        </p>
      )}

      {/* Draft warning */}
      {isDraft && !trackings.length && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          Aucun tracking trouvé. Assurez-vous que les commandes ont été envoyées à Digylog.
        </div>
      )}
    </div>
  );
}
