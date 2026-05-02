"use client";
import { useState, useTransition } from "react";
import {
  sendToDelivery, updateDeliveryStatus, markAsPaid,
  updateDeliveryTracking, setReturnCost,
} from "@/lib/delivery/actions";
import { DELIVERY_COMPANIES, DELIVERY_TRANSITIONS, DELIVERY_STATUS_LABELS } from "@/types/delivery";
import type { DeliveryStatus } from "@/types/delivery";
import { cn } from "@/lib/utils";
import { Truck, Package, CheckCircle, RefreshCw } from "lucide-react";

interface DeliveryActionsPanelProps {
  orderId: string;
  currentStatus: string;           // order.status
  deliveryStatus: DeliveryStatus | null;
  trackingNumber: string | null;
  deliveryCompany: string | null;
  deliveryCostReal: number;
  returnCost: number;
  isPaid: boolean;
}

export function DeliveryActionsPanel({
  orderId, currentStatus, deliveryStatus,
  trackingNumber, deliveryCompany, deliveryCostReal,
  returnCost, isPaid,
}: DeliveryActionsPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [toast, setToast]  = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Local editable state
  const [tracking, setTracking]   = useState(trackingNumber ?? "");
  const [company,  setCompany]    = useState(deliveryCompany ?? "");
  const [costReal, setCostReal]   = useState(deliveryCostReal);
  const [retCost,  setRetCost]    = useState(returnCost);
  const [statusNote, setNote]     = useState("");

  function showToast(type: "success" | "error", msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  }

  function run(fn: () => Promise<{ success: boolean; error?: string }>) {
    startTransition(async () => {
      const res = await fn();
      if (res.success) showToast("success", "Mis à jour.");
      else showToast("error", res.error ?? "Erreur.");
    });
  }

  const canSend = ["confirmed", "new", "processing"].includes(currentStatus) && !deliveryStatus;
  const nextStatuses = deliveryStatus ? DELIVERY_TRANSITIONS[deliveryStatus] : [];

  return (
    <div className="space-y-5">
      {toast && (
        <div className={cn(
          "rounded-lg px-4 py-3 text-sm font-medium",
          toast.type === "success" ? "bg-green-600 text-white" : "bg-red-50 border border-red-200 text-red-700"
        )}>
          {toast.type === "success" ? "✓ " : "✕ "}{toast.msg}
        </div>
      )}

      {/* Tracking info */}
      <Section title="Transporteur & Tracking" icon={<Truck className="h-4 w-4" />}>
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2">
            <select value={company} onChange={(e) => setCompany(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="">— Choisir le transporteur —</option>
              {DELIVERY_COMPANIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input type="text" value={tracking} onChange={(e) => setTracking(e.target.value)}
              placeholder="Numéro de suivi"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
            <div className="flex items-center gap-2">
              <input type="number" min="0" step="0.01" value={costReal || ""}
                onChange={(e) => setCostReal(parseFloat(e.target.value) || 0)}
                placeholder="Coût livraison réel (MAD)"
                className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring" />
              <span className="text-xs text-muted-foreground shrink-0">MAD</span>
            </div>
          </div>
          <button type="button" disabled={isPending}
            onClick={() => run(() => updateDeliveryTracking({ orderId, trackingNumber: tracking, deliveryCompany: company, deliveryCostReal: costReal }))}
            className="w-full rounded-lg bg-secondary hover:bg-secondary/80 py-2 text-sm font-medium transition-colors disabled:opacity-50">
            {isPending ? "Sauvegarde…" : "Sauvegarder tracking"}
          </button>
        </div>
      </Section>

      {/* Send to delivery */}
      {canSend && (
        <Section title="Envoyer en livraison" icon={<Package className="h-4 w-4" />}>
          <button type="button" disabled={isPending}
            onClick={() => run(() => sendToDelivery({
              orderId, trackingNumber: tracking || undefined,
              deliveryCompany: company || undefined,
              deliveryCostReal: costReal,
            }))}
            className="w-full rounded-lg bg-indigo-600 text-white py-2.5 text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50">
            Envoyer en livraison
          </button>
        </Section>
      )}

      {/* Update delivery status */}
      {nextStatuses.length > 0 && (
        <Section title="Mettre à jour le statut" icon={<RefreshCw className="h-4 w-4" />}>
          <textarea value={statusNote} onChange={(e) => setNote(e.target.value)}
            placeholder="Note optionnelle…" rows={2}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none mb-2" />
          <div className="space-y-2">
            {nextStatuses.map((s) => (
              <button key={s} type="button" disabled={isPending}
                onClick={() => run(() => updateDeliveryStatus({ orderId, deliveryStatus: s, notes: statusNote || undefined }))}
                className={cn(
                  "w-full rounded-lg py-2.5 text-sm font-medium border transition-colors disabled:opacity-50",
                  s === "delivered"        ? "bg-teal-600 text-white hover:bg-teal-700 border-transparent" :
                  s === "refused_delivery" ? "bg-red-100 text-red-700 hover:bg-red-200 border-red-200" :
                  s === "returned"         ? "bg-amber-100 text-amber-700 hover:bg-amber-200 border-amber-200" :
                  "bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-200"
                )}>
                {DELIVERY_STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </Section>
      )}

      {/* Mark as paid */}
      {deliveryStatus === "delivered" && !isPaid && (
        <Section title="Encaissement COD" icon={<CheckCircle className="h-4 w-4" />}>
          <p className="text-xs text-muted-foreground mb-3">
            Marquer le paiement comme reçu calcule automatiquement le profit réel.
          </p>
          <button type="button" disabled={isPending}
            onClick={() => run(() => markAsPaid(orderId))}
            className="w-full rounded-lg bg-green-600 text-white py-2.5 text-sm font-semibold hover:bg-green-700 transition-colors disabled:opacity-50">
            ✓ COD Encaissé — Marquer comme payé
          </button>
        </Section>
      )}

      {/* Return cost */}
      {deliveryStatus && ["returned","refused_delivery"].includes(deliveryStatus) && (
        <Section title="Coût de retour" icon={<RefreshCw className="h-4 w-4" />}>
          <div className="flex items-center gap-2">
            <input type="number" min="0" step="0.01" value={retCost || ""}
              onChange={(e) => setRetCost(parseFloat(e.target.value) || 0)}
              placeholder="0.00"
              className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring" />
            <span className="text-xs shrink-0">MAD</span>
            <button type="button" disabled={isPending}
              onClick={() => run(() => setReturnCost(orderId, retCost))}
              className="h-9 px-3 rounded-md bg-secondary hover:bg-secondary/80 text-sm font-medium disabled:opacity-50">
              OK
            </button>
          </div>
        </Section>
      )}

      {/* Already paid */}
      {isPaid && (
        <div className="flex items-center gap-2 rounded-xl bg-green-50 border border-green-200 px-4 py-3">
          <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
          <p className="text-sm text-green-800 font-medium">COD encaissé — Profit réel calculé</p>
        </div>
      )}
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-5 space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2">{icon}{title}</h3>
      {children}
    </div>
  );
}
