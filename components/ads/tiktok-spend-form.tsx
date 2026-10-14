"use client";
import { useState, useTransition } from "react";
import { addTiktokSpend, deleteTiktokSpend } from "@/lib/ads/tiktok-spend-actions";

type Product = { id: string; name: string };

export function TiktokSpendForm({ products, rate }: { products: Product[]; rate: number }) {
  const today = new Date().toISOString().slice(0, 10);
  const [day, setDay] = useState(today);
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [amount, setAmount] = useState<string>("");
  const [currency, setCurrency] = useState<"USD" | "MAD">("USD");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const n = Number(amount.replace(",", "."));
  const preview = n > 0 ? Math.round((currency === "USD" ? n * rate : n) * 100) / 100 : 0;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Jour</span>
          <input type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm" />
        </label>
        <label className="space-y-1 text-xs lg:col-span-2">
          <span className="text-muted-foreground">Produit</span>
          <select value={productId} onChange={(e) => setProductId(e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm">
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Montant dépensé</span>
          <div className="flex gap-1">
            <input inputMode="decimal" placeholder="ex : 20" value={amount} onChange={(e) => setAmount(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm" />
            <select value={currency} onChange={(e) => setCurrency(e.target.value as "USD" | "MAD")}
              className="h-9 rounded-md border bg-background px-1 text-sm">
              <option value="USD">$</option>
              <option value="MAD">MAD</option>
            </select>
          </div>
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Note (optionnel)</span>
          <input placeholder="nom campagne…" value={note} onChange={(e) => setNote(e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending || !(n > 0)}
          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          onClick={() => start(async () => {
            const r = await addTiktokSpend({ day, productId, amount: n, currency, note });
            setMsg(r.success ? r.info ?? "OK" : r.error ?? "Erreur");
            if (r.success) { setAmount(""); setNote(""); }
          })}>
          {pending ? "Ajout…" : "Ajouter la dépense"}
        </button>
        {preview > 0 && <span className="text-xs text-muted-foreground">= {preview.toLocaleString("fr-FR")} MAD comptés</span>}
        {msg && <span className="text-xs">{msg}</span>}
      </div>
    </div>
  );
}

export function DeleteTiktokSpend({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button disabled={pending} className="text-xs text-red-600 hover:underline disabled:opacity-50"
      onClick={() => { if (confirm("Supprimer cette dépense ?")) start(async () => { await deleteTiktokSpend(id); }); }}>
      {pending ? "…" : "Supprimer"}
    </button>
  );
}
