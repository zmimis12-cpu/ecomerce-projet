"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Truck, Banknote, Plus, Trash2, Settings2 } from "lucide-react";
import { generateSelfDeliveryTicket } from "@/lib/delivery/self-delivery-ticket";
import { getSelfDrivers, saveSelfDrivers, type SelfDriver } from "@/lib/delivery/self-drivers";
import { markSelfDeliveryPaid } from "@/lib/orders/actions";

/**
 * Livraison par NOTRE livreur (pas de société de livraison) :
 * choisir le livreur → son prix de livraison est appliqué → ticket PDF,
 * statut « En transit », marquée 🛵 partout, jamais envoyée chez Digylog/Speedaf.
 */
export function SelfDeliveryTicketButton({
  orderId, orderNumber, isSelf = false, hasCarrierTracking = false,
  currentDriver = null, currentFee = 0, status = "",
}: {
  orderId: string; orderNumber: string; isSelf?: boolean; hasCarrierTracking?: boolean;
  currentDriver?: string | null; currentFee?: number; status?: string;
}) {
  const [open, setOpen] = useState(false);
  const [drivers, setDrivers] = useState<SelfDriver[]>([]);
  const [driverId, setDriverId] = useState("");
  const [fee, setFee] = useState(currentFee ? String(currentFee) : "");
  const [manage, setManage] = useState(false);
  const [nd, setNd] = useState({ name: "", phone: "", fee: "" });
  const [isPending, startTransition] = useTransition();
  const [isPaidPending, startPaidTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [paidDone, setPaidDone] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    getSelfDrivers().then((list) => {
      setDrivers(list);
      const cur = list.find((d) => d.name === currentDriver) ?? (list.length === 1 ? list[0] : undefined);
      if (cur) { setDriverId(cur.id); if (!currentFee) setFee(String(cur.fee)); }
    }).catch(() => {});
  }, [open, currentDriver, currentFee]);

  function pickDriver(id: string) {
    setDriverId(id);
    const d = drivers.find((x) => x.id === id);
    if (d) setFee(String(d.fee));
  }

  function persist(list: SelfDriver[]) {
    startTransition(async () => {
      const r = await saveSelfDrivers(list);
      if (!r.success) { setError(r.error ?? "Erreur"); return; }
      setDrivers(r.drivers ?? list);
    });
  }

  function addDriver() {
    if (!nd.name.trim()) return;
    const d: SelfDriver = { id: Math.random().toString(36).slice(2, 10), name: nd.name.trim(), phone: nd.phone, fee: Number(nd.fee) || 0 };
    persist([...drivers, d]);
    setDriverId(d.id); setFee(String(d.fee));
    setNd({ name: "", phone: "", fee: "" });
  }

  function handleGenerate() {
    setError(null);
    const d = drivers.find((x) => x.id === driverId);
    startTransition(async () => {
      const res = await generateSelfDeliveryTicket(orderId, Number(fee) || 0, d ? { name: d.name, phone: d.phone } : null);
      if (!res.success || !res.base64) { setError(res.error ?? "Erreur inconnue."); return; }
      const bytes = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ticket-livraison-${orderNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setOpen(false);
      router.refresh();
    });
  }

  function handleMarkPaid() {
    startPaidTransition(async () => {
      const res = await markSelfDeliveryPaid(orderId);
      if (res.success) { setPaidDone(true); router.refresh(); }
    });
  }

  if (hasCarrierTracking) return null; // déjà chez une société de livraison

  return (
    <div className="space-y-2">
      {isSelf && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
          🛵 <b>Livrée par notre livreur</b>{currentDriver ? ` — ${currentDriver}` : ""} · livraison {currentFee} DH
          <div className="text-[11px] text-amber-700">Jamais envoyée à la société de livraison. Pour l&apos;envoyer chez Digylog : remettre le statut sur « Confirmé ».</div>
        </div>
      )}

      {!open ? (
        <button type="button" onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium hover:bg-secondary/80">
          <Truck className="h-3.5 w-3.5" /> {isSelf ? "Changer livreur / réimprimer ticket" : "Envoyer avec notre livreur (hors Digylog)"}
        </button>
      ) : (
        <div className="rounded-lg border bg-secondary/20 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium">Livreur</label>
            <button type="button" onClick={() => setManage((m) => !m)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
              <Settings2 className="h-3 w-3" /> Gérer les livreurs
            </button>
          </div>
          <select value={driverId} onChange={(e) => pickDriver(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
            <option value="">— Choisir —</option>
            {drivers.map((d) => <option key={d.id} value={d.id}>{d.name} · {d.fee} DH</option>)}
          </select>

          {manage && (
            <div className="rounded-md border bg-background p-2 space-y-1.5">
              {drivers.map((d) => (
                <div key={d.id} className="flex items-center gap-1.5 text-xs">
                  <input value={d.name} onChange={(e) => setDrivers(drivers.map((x) => x.id === d.id ? { ...x, name: e.target.value } : x))}
                    className="h-7 flex-1 min-w-0 rounded border px-1.5" />
                  <input value={d.phone} onChange={(e) => setDrivers(drivers.map((x) => x.id === d.id ? { ...x, phone: e.target.value } : x))}
                    placeholder="Tél" className="h-7 w-24 rounded border px-1.5" />
                  <input type="number" value={d.fee} onChange={(e) => setDrivers(drivers.map((x) => x.id === d.id ? { ...x, fee: Number(e.target.value) || 0 } : x))}
                    className="h-7 w-14 rounded border px-1.5" />
                  <button type="button" onClick={() => persist(drivers.filter((x) => x.id !== d.id))} className="text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
              {drivers.length > 0 && (
                <button type="button" onClick={() => persist(drivers)} disabled={isPending}
                  className="rounded bg-black px-2 py-1 text-[11px] text-white disabled:opacity-50">Enregistrer</button>
              )}
              <div className="flex items-center gap-1.5 text-xs pt-1 border-t">
                <input value={nd.name} onChange={(e) => setNd({ ...nd, name: e.target.value })} placeholder="Nom" className="h-7 flex-1 min-w-0 rounded border px-1.5" />
                <input value={nd.phone} onChange={(e) => setNd({ ...nd, phone: e.target.value })} placeholder="Tél" className="h-7 w-24 rounded border px-1.5" />
                <input type="number" value={nd.fee} onChange={(e) => setNd({ ...nd, fee: e.target.value })} placeholder="DH" className="h-7 w-14 rounded border px-1.5" />
                <button type="button" onClick={addDriver} disabled={isPending} className="text-emerald-700"><Plus className="h-4 w-4" /></button>
              </div>
            </div>
          )}

          <label className="text-xs font-medium">Prix de livraison (DH)</label>
          <input type="number" value={fee} onChange={(e) => setFee(e.target.value)}
            placeholder="0" className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" />
          <p className="text-[11px] text-muted-foreground">
            Rempli automatiquement avec le prix du livreur, modifiable. Compté comme coût de livraison dans le dashboard.
            {["new", "confirmed", "processing", "pending", "no_answer"].includes(status) && " La commande passe en « En transit » et ne sera jamais envoyée à la société de livraison."}
          </p>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setOpen(false)}
              className="rounded-md px-3 py-1.5 text-xs font-medium hover:bg-secondary/80">
              Annuler
            </button>
            <button type="button" onClick={handleGenerate} disabled={isPending}
              className="flex items-center gap-1.5 rounded-md bg-black text-white px-3 py-1.5 text-xs font-medium disabled:opacity-50">
              <Truck className="h-3.5 w-3.5" /> {isPending ? "…" : "Valider + ticket"}
            </button>
          </div>
        </div>
      )}

      {/* Marquer payée en espèces — livraison propre (le livreur remet l'argent). */}
      {status !== "paid" && (paidDone ? (
        <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
          <Banknote className="h-3.5 w-3.5" /> Marquée payée (espèce, livreur propre)
        </span>
      ) : (
        <button type="button" onClick={handleMarkPaid} disabled={isPaidPending}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-50 text-emerald-700 px-3 py-1.5 text-xs font-medium hover:bg-emerald-100 disabled:opacity-50">
          <Banknote className="h-3.5 w-3.5" /> {isPaidPending ? "…" : "Livrée + payée (espèce, notre livreur)"}
        </button>
      ))}
    </div>
  );
}
