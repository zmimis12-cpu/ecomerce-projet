"use client";
import { useState, useTransition } from "react";
import { MessageCircle } from "lucide-react";
import { saveAbandonedWaTemplate } from "@/lib/orders/abandoned-actions";

/** Message WhatsApp de relance des paniers abandonnés — modifiable par l'admin. */
export function AbandonedWaTemplateEditor({ initial, fallback }: { initial: string; fallback: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(initial);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  function save(value: string) {
    start(async () => {
      const r = await saveAbandonedWaTemplate(value);
      setMsg(r.success ? "✅ Enregistré" : `❌ ${r.error}`);
    });
  }

  return (
    <div className="rounded-xl border bg-card">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 p-3 text-sm font-medium">
        <MessageCircle className="h-4 w-4 text-green-600" /> Message WhatsApp de relance
        <span className="ml-auto text-xs text-muted-foreground">{open ? "Fermer" : "Modifier"}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t p-3">
          <p className="text-xs text-muted-foreground">
            Le bouton « WhatsApp relance » ouvre WhatsApp avec ce message déjà écrit. Variables : <code>{"{prenom}"}</code> <code>{"{produit}"}</code> <code>{"{prix}"}</code> <code>{"{ville}"}</code>
          </p>
          <textarea value={text} onChange={(e) => setText(e.target.value)} dir="auto" rows={12}
            className="w-full rounded-md border bg-background p-2 text-sm" />
          <div className="flex items-center gap-2">
            <button type="button" disabled={pending} onClick={() => save(text)}
              className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">Enregistrer</button>
            <button type="button" disabled={pending} onClick={() => { setText(fallback); save(""); }}
              className="rounded-md border px-3 py-1.5 text-xs">Message par défaut</button>
            {msg && <span className="text-xs">{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
