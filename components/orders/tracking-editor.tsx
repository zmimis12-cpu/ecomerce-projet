"use client";

import { useState, useTransition } from "react";
import { updateTrackingNumber, updateOrderNotes } from "@/lib/orders/actions";
import { Truck, FileText, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface TrackingEditorProps {
  orderId: string;
  tracking: string | null;
  notes: string | null;
  canEdit: boolean;
}

export function TrackingEditor({ orderId, tracking, notes, canEdit }: TrackingEditorProps) {
  const [trackingVal, setTrackingVal] = useState(tracking ?? "");
  const [notesVal, setNotesVal] = useState(notes ?? "");
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function save() {
    startTransition(async () => {
      await Promise.all([
        updateTrackingNumber(orderId, trackingVal),
        updateOrderNotes(orderId, notesVal),
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
          <Truck className="h-3.5 w-3.5" /> Numéro de suivi
        </label>
        <input type="text" value={trackingVal} onChange={(e) => setTrackingVal(e.target.value)}
          disabled={!canEdit || isPending} placeholder="Ex: DGL-123456"
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50" />
      </div>

      <div className="space-y-1.5">
        <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
          <FileText className="h-3.5 w-3.5" /> Notes
        </label>
        <textarea value={notesVal} onChange={(e) => setNotesVal(e.target.value)}
          disabled={!canEdit || isPending} rows={3} placeholder="Remarques sur la commande…"
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 resize-none" />
      </div>

      {canEdit && (
        <button type="button" onClick={save} disabled={isPending}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
            saved ? "bg-green-100 text-green-700" : "bg-secondary hover:bg-secondary/80"
          )}>
          {saved ? <><Check className="h-3 w-3" /> Sauvegardé</> : isPending ? "Sauvegarde…" : "Sauvegarder"}
        </button>
      )}
    </div>
  );
}
