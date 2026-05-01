"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface Product {
  id: string; name: string; sku: string;
  sale_price_mad: number; total_cost_mad: number;
}
interface Agent { id: string; full_name: string; email: string; role: string; }

interface OrderFormProps {
  products: Product[];
  agents: Agent[];
  onSubmit: (fd: FormData) => Promise<{ success: boolean; errors?: Record<string, string>; orderId?: string; orderNumber?: string; isDuplicate?: boolean; duplicateOfNumber?: string | null }>;
}

export function OrderForm({ products, agents, onSubmit }: OrderFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const [values, setValues] = useState({
    customer_name:    "",
    customer_phone:   "",
    customer_city:    "",
    customer_address: "",
    product_id:       "",
    quantity:         1,
    shipping_charge:  0,
    source:           "manual",
    notes:            "",
    assigned_to:      "",
  });

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  useEffect(() => {
    const p = products.find((p) => p.id === values.product_id) ?? null;
    setSelectedProduct(p);
  }, [values.product_id, products]);

  // Live calculations
  const unitPrice  = selectedProduct?.sale_price_mad ?? 0;
  const unitCost   = selectedProduct?.total_cost_mad ?? 0;
  const subtotal   = unitPrice * values.quantity;
  const totalAmount = subtotal + values.shipping_charge;
  const cogs       = unitCost * values.quantity;
  const estProfit  = totalAmount - cogs;

  function set(key: string, value: string | number) {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => { const n = { ...e }; delete n[key]; return n; });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    const fd = new FormData();
    Object.entries(values).forEach(([k, v]) => fd.set(k, String(v)));

    startTransition(async () => {
      const result = await onSubmit(fd);
      if (result.success) {
        const msg = result.isDuplicate
          ? `Commande ${result.orderNumber} créée — ⚠️ doublon suspect détecté.`
          : `Commande ${result.orderNumber} créée !`;
        setToast({ type: result.isDuplicate ? "error" : "success", msg });
        setTimeout(() => { router.push(`/admin/orders/${result.orderId}`); }, 1200);
      } else {
        setErrors(result.errors ?? {});
        setToast({ type: "error", msg: result.errors?._form ?? "Erreur." });
        setTimeout(() => setToast(null), 5000);
      }
    });
  }

  return (
    <div className="relative">
      {toast && (
        <div className={cn(
          "fixed top-4 right-4 z-50 rounded-lg px-4 py-3 text-sm font-medium shadow-lg",
          toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
        )}>
          {toast.type === "success" ? "✓" : "✕"} {toast.msg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Customer info */}
        <Section title="Informations client">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nom complet *" error={errors.customer_name}>
              <Input value={values.customer_name} onChange={(v) => set("customer_name", v)}
                placeholder="Mohamed Alami" disabled={isPending} />
            </Field>
            <Field label="Téléphone *" error={errors.customer_phone}>
              <Input value={values.customer_phone} onChange={(v) => set("customer_phone", v)}
                placeholder="0612345678" disabled={isPending} />
            </Field>
            <Field label="Ville *" error={errors.customer_city}>
              <Input value={values.customer_city} onChange={(v) => set("customer_city", v)}
                placeholder="Casablanca" disabled={isPending} />
            </Field>
            <Field label="Adresse">
              <Input value={values.customer_address} onChange={(v) => set("customer_address", v)}
                placeholder="Rue, quartier…" disabled={isPending} />
            </Field>
          </div>
        </Section>

        {/* Product */}
        <Section title="Produit">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Produit *" error={errors.product_id} className="sm:col-span-2">
              <select
                value={values.product_id}
                onChange={(e) => set("product_id", e.target.value)}
                disabled={isPending}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="">— Sélectionnez un produit —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    [{p.sku}] {p.name} — {p.sale_price_mad.toFixed(2)} MAD
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Quantité *" error={errors.quantity}>
              <input
                type="number" min="1" step="1"
                value={values.quantity}
                onChange={(e) => set("quantity", Math.max(1, parseInt(e.target.value) || 1))}
                disabled={isPending}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              />
            </Field>

            <Field label="Frais de livraison (MAD)">
              <input
                type="number" min="0" step="0.01"
                value={values.shipping_charge || ""}
                onChange={(e) => set("shipping_charge", parseFloat(e.target.value) || 0)}
                placeholder="0.00" disabled={isPending}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              />
            </Field>
          </div>

          {/* Live calc */}
          {selectedProduct && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-lg bg-slate-50 p-4">
              <CalcStat label="Sous-total"     value={`${subtotal.toFixed(2)} MAD`} />
              <CalcStat label="Total commande" value={`${totalAmount.toFixed(2)} MAD`} />
              <CalcStat label="Coût total"     value={`${cogs.toFixed(2)} MAD`} />
              <CalcStat label="Profit estimé"  value={`${estProfit.toFixed(2)} MAD`}
                className={estProfit >= 0 ? "text-green-600 font-bold" : "text-red-600 font-bold"} />
            </div>
          )}
        </Section>

        {/* Order meta */}
        <Section title="Informations commande">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Source">
              <select value={values.source} onChange={(e) => set("source", e.target.value)}
                disabled={isPending}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
                {["manual","facebook","instagram","tiktok","google","website","phone","whatsapp"].map((s) => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </Field>

            <Field label="Assigner à un agent">
              <select value={values.assigned_to} onChange={(e) => set("assigned_to", e.target.value)}
                disabled={isPending}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
                <option value="">— Non assigné —</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.full_name} ({a.role})</option>
                ))}
              </select>
            </Field>

            <Field label="Notes" className="sm:col-span-2">
              <textarea value={values.notes} onChange={(e) => set("notes", e.target.value)}
                placeholder="Instructions, remarques…" rows={2} disabled={isPending}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 resize-none" />
            </Field>
          </div>
        </Section>

        {errors._form && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errors._form}
          </div>
        )}

        <div className="flex items-center gap-3 justify-end">
          <button type="button" onClick={() => router.back()} disabled={isPending}
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50">
            Annuler
          </button>
          <button type="submit" disabled={isPending}
            className="px-6 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed">
            {isPending ? "Création…" : "Créer la commande"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children, error, className }: { label: string; children: React.ReactNode; error?: string; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</label>
      {children}
      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
    </div>
  );
}

function Input({ value, onChange, placeholder, disabled }: { value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }) {
  return (
    <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder} disabled={disabled}
      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50" />
  );
}

function CalcStat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-sm font-mono font-semibold mt-0.5", className ?? "text-foreground")}>{value}</p>
    </div>
  );
}
