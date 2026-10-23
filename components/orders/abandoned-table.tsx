"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Phone, MessageCircle, CheckCircle2, XCircle, PhoneCall } from "lucide-react";
import type { AbandonedCart } from "@/lib/orders/abandoned";
import { setAbandonedStatus, convertAbandonedCart } from "@/lib/orders/abandoned-actions";
import { cn } from "@/lib/utils";

const ST: Record<string, [string, string]> = {
  pending: ["À appeler", "bg-amber-100 text-amber-800"],
  called: ["Appelé", "bg-blue-100 text-blue-800"],
  converted: ["Commande créée", "bg-green-100 text-green-800"],
  not_interested: ["Pas intéressé", "bg-slate-100 text-slate-600"],
};

function wa(phone: string) {
  const d = phone.replace(/\D/g, "");
  return `https://wa.me/${d.startsWith("0") ? "212" + d.slice(1) : d}`;
}

export function AbandonedTable({ rows }: { rows: AbandonedCart[] }) {
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [, start] = useTransition();
  if (!rows.length) return <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">Aucun panier ici pour le moment.</div>;

  function run(id: string, fn: () => Promise<{ success: boolean; error?: string; orderNumber?: string }>) {
    setBusy(id);
    start(async () => {
      const r = await fn();
      setMsg((m) => ({ ...m, [id]: r.success ? (r.orderNumber ? `✅ Commande ${r.orderNumber}` : "✅") : `❌ ${r.error}` }));
      setBusy("");
    });
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="p-3 text-left">Date</th><th className="p-3 text-left">Client</th><th className="p-3 text-left">Produit</th>
            <th className="p-3 text-right">Total</th><th className="p-3 text-left">Statut</th><th className="p-3 text-left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b last:border-0 align-top">
              <td className="p-3 whitespace-nowrap text-xs text-muted-foreground">
                {new Date(r.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </td>
              <td className="p-3">
                <div className="font-medium" dir="auto">{r.customer_name || "—"}</div>
                <div className="flex items-center gap-2 text-xs">
                  <a href={`tel:${r.customer_phone}`} className="flex items-center gap-1 text-primary hover:underline"><Phone className="h-3 w-3" />{r.customer_phone}</a>
                  <a href={wa(r.customer_phone)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-green-600 hover:underline"><MessageCircle className="h-3 w-3" />WhatsApp</a>
                </div>
                <div className="text-xs text-muted-foreground" dir="auto">{r.customer_city || "ville ?"}</div>
              </td>
              <td className="p-3">
                <div dir="auto">{r.product_name ?? r.landing_page_slug ?? "—"}</div>
                <div className="text-xs text-muted-foreground">×{r.quantity ?? 1}{r.creative_code ? ` · ${r.creative_code}` : ""}</div>
              </td>
              <td className="p-3 text-right font-mono whitespace-nowrap">{r.total_amount ? `${Number(r.total_amount).toFixed(0)} DH` : "—"}</td>
              <td className="p-3"><span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", ST[r.status]?.[1])}>{ST[r.status]?.[0] ?? r.status}</span></td>
              <td className="p-3">
                {r.status === "converted" ? (
                  r.order_id ? <Link href={`/admin/orders/${r.order_id}`} className="text-xs text-primary hover:underline">Voir la commande →</Link> : null
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    <button disabled={busy === r.id} onClick={() => run(r.id, () => convertAbandonedCart(r.id))}
                      className="flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Créer la commande
                    </button>
                    {r.status !== "called" && (
                      <button disabled={busy === r.id} onClick={() => run(r.id, () => setAbandonedStatus(r.id, "called"))}
                        className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-50">
                        <PhoneCall className="h-3.5 w-3.5" /> Appelé (pas de réponse)
                      </button>
                    )}
                    {r.status !== "not_interested" && (
                      <button disabled={busy === r.id} onClick={() => run(r.id, () => setAbandonedStatus(r.id, "not_interested"))}
                        className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50">
                        <XCircle className="h-3.5 w-3.5" /> Pas intéressé
                      </button>
                    )}
                  </div>
                )}
                {msg[r.id] && <p className="mt-1 text-xs">{msg[r.id]}</p>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
