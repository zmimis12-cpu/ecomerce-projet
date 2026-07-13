"use client";

import { useState, useTransition } from "react";
import { MessageCircle, ExternalLink, Download, Copy, Check } from "lucide-react";
import { generateManualWhatsAppConfirmation } from "@/lib/whatsapp/actions";

export function ManualWhatsAppPanel({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [data, setData] = useState<{
    waLink?: string; message?: string; media?: { media_url: string; media_type: string }[]; error?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  function generate() {
    setOpen(true);
    setData(null);
    startTransition(async () => {
      const res = await generateManualWhatsAppConfirmation(orderId);
      setData(res.success ? res : { error: res.error });
    });
  }

  function copyMessage() {
    if (!data?.message) return;
    navigator.clipboard.writeText(data.message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!open) {
    return (
      <button type="button" onClick={generate}
        className="flex items-center gap-1.5 rounded-lg bg-emerald-50 text-emerald-700 px-3 py-1.5 text-xs font-medium hover:bg-emerald-100 transition-colors">
        <MessageCircle className="h-3.5 w-3.5" /> Confirmation WhatsApp (manuel)
      </button>
    );
  }

  return (
    <div className="rounded-lg border bg-secondary/30 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">Confirmation WhatsApp</span>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">Fermer</button>
      </div>

      {isPending && <p className="text-xs text-muted-foreground">Génération...</p>}
      {data?.error && <p className="text-xs text-red-600 bg-red-50 rounded-md px-3 py-2">{data.error}</p>}

      {data?.waLink && (
        <>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Message (Darija)</label>
              <button type="button" onClick={copyMessage} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {copied ? "Copié" : "Copier"}
              </button>
            </div>
            <p dir="rtl" className="text-xs bg-white rounded-md border px-3 py-2 whitespace-pre-wrap">{data.message}</p>
          </div>

          <a href={data.waLink} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 text-white px-3 py-2 text-sm font-medium hover:bg-emerald-700">
            <ExternalLink className="h-4 w-4" /> Ouvrir WhatsApp et envoyer
          </a>

          {data.media && data.media.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                Puis transfère ces {data.media.length} photo(s)/vidéo(s) manuellement
              </label>
              <div className="grid grid-cols-4 gap-2">
                {data.media.map((m, i) => (
                  <a key={i} href={m.media_url} target="_blank" rel="noopener noreferrer" download
                    className="relative group rounded-lg overflow-hidden border aspect-square bg-white">
                    {m.media_type === "video" ? (
                      <video src={m.media_url} className="w-full h-full object-cover" muted />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.media_url} alt="" className="w-full h-full object-cover" />
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors">
                      <Download className="h-4 w-4 text-white opacity-0 group-hover:opacity-100" />
                    </div>
                  </a>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">Clique pour télécharger, puis glisse-les dans la conversation WhatsApp ouverte.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
