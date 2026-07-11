"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Repeat, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { createExchange } from "@/lib/orders/exchange-actions";

interface ProductOption {
  id: string;
  name: string;
  sku: string;
}

interface ExchangeDialogProps {
  orderId: string;
  orderNumber: string;
  currentQuantity: number;
  products: ProductOption[];
}

export function ExchangeDialog({ orderId, orderNumber, currentQuantity, products }: ExchangeDialogProps) {
  const [open, setOpen]           = useState(false);
  const [mode, setMode]           = useState<"same_product" | "new_product">("same_product");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity]   = useState(currentQuantity || 1);
  const [tracking, setTracking]   = useState("");
  const [codOverride, setCodOverride] = useState("");
  const [notes, setNotes]         = useState("");
  const [error, setError]         = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createExchange({
        originalOrderId:  orderId,
        exchangeTracking: tracking,
        mode,
        productId:        mode === "new_product" ? productId : undefined,
        quantity,
        codAmountOverride: codOverride ? parseFloat(codOverride) : undefined,
        notes:            notes || undefined,
      });
      if (!res.success) {
        setError(res.error ?? "Erreur inconnue.");
        return;
      }
      setOpen(false);
      router.push(`/admin/orders/${res.newOrderId}`);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg bg-violet-50 text-violet-700 px-3 py-1.5 text-xs font-medium hover:bg-violet-100 transition-colors">
        <Repeat className="h-3.5 w-3.5" /> Générer échange
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-card border shadow-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Repeat className="h-4 w-4 text-violet-600" /> Échange — {orderNumber}
          </h3>
          <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          Colle ici le tracking réel donné par Digylog après avoir cliqué &quot;Générer échange&quot; (visible sur l&apos;étiquette/BL — le badge <span className="font-mono">EC</span> affiché dans la liste Digylog n&apos;en fait pas partie, ne le tape pas).
        </p>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tracking échange Digylog</label>
          <input type="text" value={tracking} onChange={(e) => setTracking(e.target.value.toUpperCase())}
            placeholder="S0618116R" disabled={isPending}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50" />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Produit</label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setMode("same_product")} disabled={isPending}
              className={cn("flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                mode === "same_product" ? "bg-violet-50 border-violet-300 text-violet-700" : "hover:bg-secondary/50")}>
              Même produit
            </button>
            <button type="button" onClick={() => setMode("new_product")} disabled={isPending}
              className={cn("flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                mode === "new_product" ? "bg-violet-50 border-violet-300 text-violet-700" : "hover:bg-secondary/50")}>
              Changer de produit
            </button>
          </div>
        </div>

        {mode === "new_product" && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Nouveau produit</label>
            <select value={productId} onChange={(e) => setProductId(e.target.value)} disabled={isPending}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
              <option value="">Sélectionner…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Quantité</label>
            <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
              disabled={isPending}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Contre-remb. (MAD)</label>
            <input type="number" value={codOverride} onChange={(e) => setCodOverride(e.target.value)}
              placeholder="auto" disabled={isPending}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50" />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes (optionnel)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} disabled={isPending}
            placeholder="Raison de l'échange…"
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 resize-none" />
        </div>

        {error && <p className="text-xs text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={() => setOpen(false)} disabled={isPending}
            className="rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-secondary/80 transition-colors">
            Annuler
          </button>
          <button type="button" onClick={submit} disabled={isPending || !tracking || (mode === "new_product" && !productId)}
            className="rounded-lg bg-violet-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-violet-700 disabled:opacity-50 transition-colors">
            {isPending ? "Création…" : "Créer l'échange"}
          </button>
        </div>
      </div>
    </div>
  );
}
