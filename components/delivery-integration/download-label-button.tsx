"use client";
import { useTransition } from "react";
import { getDigylogLabelUrl, getDigylogBlUrl } from "@/lib/delivery/shipment-actions";
import { FileDown } from "lucide-react";

function downloadPdf(b64: string, filename: string) {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const blob = new Blob([buf], { type: "application/pdf" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function DownloadLabelButton({ tracking }: { tracking: string }) {
  const [isPending, startTransition] = useTransition();

  function handle() {
    startTransition(async () => {
      const res = await getDigylogLabelUrl([tracking]);
      if (res.ok && res.blobBase64) {
        downloadPdf(res.blobBase64, `label-${tracking}.pdf`);
      } else {
        alert(res.error ?? "Erreur téléchargement");
      }
    });
  }

  return (
    <button type="button" onClick={handle} disabled={isPending}
      className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50">
      <FileDown className="h-3.5 w-3.5" />
      {isPending ? "…" : "Étiquette"}
    </button>
  );
}

export function DownloadBlButton({ blId }: { blId: number }) {
  const [isPending, startTransition] = useTransition();

  function handle() {
    startTransition(async () => {
      const res = await getDigylogBlUrl(blId);
      if (res.ok && res.blobBase64) {
        downloadPdf(res.blobBase64, `bl-${blId}.pdf`);
      } else {
        alert(res.error ?? "Erreur téléchargement BL");
      }
    });
  }

  return (
    <button type="button" onClick={handle} disabled={isPending}
      className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50">
      <FileDown className="h-3.5 w-3.5" />
      {isPending ? "…" : `BL #${blId}`}
    </button>
  );
}
