"use client";
import { useState, useTransition } from "react";
import { downloadBatchBl, downloadBatchLabels } from "@/lib/delivery/batch/actions";
import { createDigylogClientFromDB } from "@/lib/delivery/digylog/client";
import { FileDown, Loader2 } from "lucide-react";

// Server action to download BL by raw bl_id
import { getBlPdfByBlId, getLabelsByTrackings } from "@/lib/delivery/document-actions";

function downloadBlob(b64: string, name: string) {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([buf], { type: "application/pdf" }));
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  URL.revokeObjectURL(url);
}

export function FetchDocumentForm() {
  const [isPending, startTransition] = useTransition();
  const [blId, setBlId]     = useState("");
  const [msg, setMsg]       = useState<{ ok: boolean; text: string } | null>(null);

  function handleBl() {
    if (!blId.trim()) return;
    setMsg(null);
    startTransition(async () => {
      const r = await getBlPdfByBlId(Number(blId));
      if (r.ok && r.blobBase64) {
        downloadBlob(r.blobBase64, `BL-${blId}.pdf`);
        setMsg({ ok: true, text: `✓ BL #${blId} téléchargé` });
      } else {
        setMsg({ ok: false, text: r.error ?? "Erreur" });
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Download BL by ID */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Télécharger BL Digylog</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Entrez le numéro BL Digylog (ex: 861409) pour télécharger le PDF.
          </p>
        </div>
        <div className="flex gap-3">
          <input
            type="number"
            value={blId}
            onChange={(e) => setBlId(e.target.value)}
            placeholder="Ex: 861409"
            className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="button"
            onClick={handleBl}
            disabled={isPending || !blId.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            Télécharger BL PDF
          </button>
        </div>
        {msg && (
          <p className={`text-sm font-medium ${msg.ok ? "text-green-700" : "text-red-600"}`}>
            {msg.text}
          </p>
        )}
      </div>

      {/* Info */}
      <div className="rounded-xl border bg-secondary/30 p-4 text-xs text-muted-foreground space-y-1">
        <p className="font-semibold text-foreground text-sm">💡 Comment trouver votre BL ID ?</p>
        <p>Allez dans <strong>Delivery Notes</strong> → colonne <strong>BL ID</strong></p>
        <p>Ou dans votre espace Digylog → Commandes → Numéro BL</p>
      </div>
    </div>
  );
}
