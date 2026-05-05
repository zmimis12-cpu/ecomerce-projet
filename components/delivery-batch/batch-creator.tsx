"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBatch } from "@/lib/delivery/batch/actions";
import { Search, CheckSquare, Square, Package } from "lucide-react";

interface Product { id: string; name: string; sku: string; quantity: number; }
interface Order {
  id: string; order_number: string; customer_name: string;
  customer_phone: string; customer_city: string;
  total_amount_mad: number; created_at: string;
  products: Product[];
}

export function BatchCreator({ orders }: { orders: Order[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch]     = useState("");
  const [cityFilter, setCity]   = useState("all");
  const [notes, setNotes]       = useState("");
  const [error, setError]       = useState<string | null>(null);

  const cities = ["all", ...new Set(orders.map((o) => o.customer_city).sort())];

  const filtered = orders.filter((o) => {
    const q = search.toLowerCase();
    const matchSearch = !q || [o.order_number, o.customer_name, o.customer_phone]
      .some((f) => f.toLowerCase().includes(q));
    const matchCity = cityFilter === "all" || o.customer_city === cityFilter;
    return matchSearch && matchCity;
  });

  function toggle(id: string) {
    setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  }
  function toggleAll() {
    setSelected((s) => s.length === filtered.length ? [] : filtered.map((o) => o.id));
  }

  // Live product summary for selection
  const selectedOrders = orders.filter((o) => selected.includes(o.id));
  const prodMap = new Map<string, { name: string; qty: number }>();
  for (const o of selectedOrders) {
    for (const p of o.products) {
      const key = p.id || p.name;
      if (!prodMap.has(key)) prodMap.set(key, { name: p.name, qty: 0 });
      prodMap.get(key)!.qty += p.quantity;
    }
  }
  const prodSummary = [...prodMap.values()].sort((a, b) => b.qty - a.qty);

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      const res = await createBatch(selected, notes);
      if (res.success && res.batchId) {
        router.push(`/admin/delivery/batches/${res.batchId}`);
      } else {
        setError(res.error ?? "Erreur création batch.");
      }
    });
  }

  if (!orders.length) return (
    <div className="rounded-xl border bg-card flex flex-col items-center justify-center py-16 text-center gap-3 text-muted-foreground">
      <Package className="h-10 w-10 opacity-20" />
      <p className="text-sm font-medium">Aucune commande confirmée disponible</p>
      <p className="text-xs">Les commandes confirmées sans tracking apparaissent ici.</p>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Commande, client, téléphone…"
            className="flex h-9 w-full rounded-md border border-input bg-background pr-10 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <select value={cityFilter} onChange={(e) => setCity(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
          {cities.map((c) => (
            <option key={c} value={c}>{c === "all" ? "Toutes les villes" : c}</option>
          ))}
        </select>
        <span className="text-sm text-muted-foreground ml-auto">
          {filtered.length} commande(s) disponible(s)
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Orders table */}
        <div className="lg:col-span-2 space-y-3">
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-secondary/20">
              <button type="button" onClick={toggleAll}
                className="flex items-center gap-2 text-sm font-medium hover:text-primary">
                {selected.length === filtered.length && filtered.length > 0
                  ? <CheckSquare className="h-4 w-4 text-primary" />
                  : <Square className="h-4 w-4" />}
                Tout sélectionner ({filtered.length})
              </button>
              <span className="text-sm font-semibold text-primary">
                {selected.length} sélectionné(s)
              </span>
            </div>
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card border-b">
                  <tr>
                    {["","Commande","Client","Ville","Produits","Total"].map((h) => (
                      <th key={h} className="text-left px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((o) => (
                    <tr key={o.id}
                      className={`cursor-pointer transition-colors ${selected.includes(o.id) ? "bg-primary/5" : "hover:bg-secondary/20"}`}
                      onClick={() => toggle(o.id)}>
                      <td className="px-3 py-2.5">
                        <input type="checkbox" readOnly checked={selected.includes(o.id)}
                          className="rounded pointer-events-none" />
                      </td>
                      <td className="px-3 py-2.5 font-mono font-medium">{o.order_number}</td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium">{o.customer_name}</p>
                        <p className="text-muted-foreground">{o.customer_phone}</p>
                      </td>
                      <td className="px-3 py-2.5">{o.customer_city}</td>
                      <td className="px-3 py-2.5">
                        {o.products.map((p, i) => (
                          <span key={i} className="block">
                            {p.name} <span className="text-muted-foreground">×{p.quantity}</span>
                          </span>
                        ))}
                      </td>
                      <td className="px-3 py-2.5 font-mono font-semibold">
                        {o.total_amount_mad.toFixed(0)} MAD
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right panel: summary + create */}
        <div className="space-y-4">
          {/* Product summary */}
          {prodSummary.length > 0 && (
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <h3 className="text-sm font-semibold">Résumé produits</h3>
              <div className="space-y-2">
                {prodSummary.map((p, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground truncate flex-1">{p.name}</span>
                    <span className="text-sm font-bold font-mono text-primary ml-2">{p.qty}</span>
                  </div>
                ))}
              </div>
              <div className="border-t pt-2 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Total produits</span>
                <span className="font-bold font-mono">
                  {prodSummary.reduce((s, p) => s + p.qty, 0)}
                </span>
              </div>
            </div>
          )}

          {/* Notes + Create */}
          <div className="rounded-xl border bg-card p-4 space-y-4">
            <h3 className="text-sm font-semibold">Créer le groupe</h3>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Notes (optionnel)
              </label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                rows={2} placeholder="Remarques sur ce groupe…"
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
            </div>

            {error && (
              <p className="text-xs text-red-600 font-medium">{error}</p>
            )}

            <button type="button" onClick={handleCreate}
              disabled={isPending || !selected.length}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity">
              {isPending
                ? "Création…"
                : `Créer groupe (${selected.length} commandes)`}
            </button>

            {!selected.length && (
              <p className="text-xs text-muted-foreground text-center">
                Sélectionnez des commandes pour continuer.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
