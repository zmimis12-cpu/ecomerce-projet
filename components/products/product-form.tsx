"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { generateSlug, computeCosts, formatMAD } from "@/types/products";
import { cn } from "@/lib/utils";
import type { Product } from "@/types/products";

interface ProductFormProps {
  product?: Product;
  onSubmit: (formData: FormData) => Promise<{ success: boolean; errors?: Record<string, string>; productId?: string }>;
}

interface CostSummary { total: number; profit: number; margin: number; minPrice: number; }

export function ProductForm({ product, onSubmit }: ProductFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const [values, setValues] = useState({
    name:                  product?.name ?? "",
    slug:                  product?.slug ?? "",
    description:           product?.description ?? "",
    sku:                   product?.sku ?? "",
    is_active:             product?.is_active ?? true,
    sale_price_mad:        product?.sale_price_mad ?? 0,
    purchase_price_mad:    product?.purchase_price_mad ?? 0,
    packaging_cost_mad:    product?.packaging_cost_mad ?? 0,
    confirmation_cost_mad: product?.confirmation_cost_mad ?? 0,
    shipping_cost_mad:     product?.shipping_cost_mad ?? 0,
    ads_cost_mad:          product?.ads_cost_mad ?? 0,
    other_costs_mad:       product?.other_costs_mad ?? 0,
  });

  const [costs, setCosts] = useState<CostSummary>(computeCosts(values));

  // Auto-generate slug from name (only on create)
  useEffect(() => {
    if (!product && values.name) {
      setValues((v) => ({ ...v, slug: generateSlug(v.name) }));
    }
  }, [values.name, product]);

  // Recompute costs on any price change — values object identity changes every render so we use individual fields
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setCosts(computeCosts(values));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.sale_price_mad, values.purchase_price_mad, values.packaging_cost_mad,
      values.confirmation_cost_mad, values.shipping_cost_mad, values.ads_cost_mad,
      values.other_costs_mad]);

  function set(key: string, value: string | number | boolean) {
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
        setToast({ type: "success", msg: product ? "Produit mis à jour." : "Produit créé avec succès." });
        setTimeout(() => setToast(null), 3000);
        if (!product && result.productId) {
          router.push(`/admin/products/${result.productId}`);
        }
      } else {
        setErrors(result.errors ?? {});
        setToast({ type: "error", msg: result.errors?._form ?? "Une erreur s'est produite." });
        setTimeout(() => setToast(null), 5000);
      }
    });
  }

  const profitColor = costs.profit >= 0 ? "text-green-600" : "text-red-600";
  const marginColor = costs.margin >= 20 ? "text-green-600" : costs.margin >= 10 ? "text-amber-600" : "text-red-600";

  return (
    <div className="relative">
      {/* Toast */}
      {toast && (
        <div className={cn(
          "fixed top-4 right-4 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium shadow-lg transition-all",
          toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
        )}>
          {toast.type === "success" ? "✓" : "✕"} {toast.msg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Row 1 — General info */}
        <Card title="Informations générales">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nom du produit *" error={errors.name}>
              <Input
                value={values.name}
                onChange={(v) => set("name", v)}
                placeholder="Ex: Chaussures Sneaker Classic"
                disabled={isPending}
              />
            </Field>
            <Field label="SKU *" error={errors.sku}>
              <Input
                value={values.sku}
                onChange={(v) => set("sku", v.toUpperCase())}
                placeholder="Ex: SNK-001"
                className="font-mono"
                disabled={isPending}
              />
            </Field>
            <Field label="Slug URL *" error={errors.slug} hint="Utilisé dans les URLs — sans espaces">
              <Input
                value={values.slug}
                onChange={(v) => set("slug", v.toLowerCase().replace(/\s+/g, "-"))}
                placeholder="chaussures-sneaker-classic"
                className="font-mono text-xs"
                disabled={isPending}
              />
            </Field>
            <Field label="Statut">
              <div className="flex items-center gap-3 h-10">
                <button
                  type="button"
                  onClick={() => set("is_active", !values.is_active)}
                  className={cn(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                    values.is_active ? "bg-green-500" : "bg-slate-300"
                  )}
                >
                  <span className={cn(
                    "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                    values.is_active ? "translate-x-6" : "translate-x-1"
                  )} />
                </button>
                <span className="text-sm font-medium">
                  {values.is_active ? "Actif" : "Inactif"}
                </span>
              </div>
            </Field>
          </div>
          <Field label="Description" className="mt-4">
            <textarea
              value={values.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Description du produit..."
              rows={3}
              disabled={isPending}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 resize-none"
            />
          </Field>
        </Card>

        {/* Row 2 — Pricing */}
        <Card title="Prix de vente">
          <Field label="Prix de vente (MAD) *" error={errors.sale_price_mad}>
            <NumInput
              value={values.sale_price_mad}
              onChange={(v) => set("sale_price_mad", v)}
              disabled={isPending}
            />
          </Field>
        </Card>

        {/* Row 3 — Costs */}
        <Card title="Structure des coûts">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { key: "purchase_price_mad",    label: "Prix d'achat (MAD)" },
              { key: "packaging_cost_mad",    label: "Emballage (MAD)" },
              { key: "confirmation_cost_mad", label: "Confirmation (MAD)" },
              { key: "shipping_cost_mad",     label: "Livraison (MAD)" },
              { key: "ads_cost_mad",          label: "Publicité estimée (MAD)" },
              { key: "other_costs_mad",       label: "Autres coûts (MAD)" },
            ].map(({ key, label }) => (
              <Field key={key} label={label}>
                <NumInput
                  value={values[key as keyof typeof values] as number}
                  onChange={(v) => set(key, v)}
                  disabled={isPending}
                />
              </Field>
            ))}
          </div>
        </Card>

        {/* Row 4 — Live cost summary */}
        <Card title="Résumé financier estimé" className="bg-slate-50">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Coût total"       value={formatMAD(costs.total)}    />
            <Stat label="Prix min rentable" value={formatMAD(costs.minPrice)} />
            <Stat label="Profit estimé"    value={formatMAD(costs.profit)}    className={profitColor} />
            <Stat label="Marge %"          value={`${costs.margin.toFixed(1)}%`} className={marginColor} />
          </div>
          {costs.profit < 0 && (
            <p className="mt-3 text-xs text-red-600 font-medium">
              ⚠️ Le prix de vente est inférieur au coût total. Le produit est vendu à perte.
            </p>
          )}
          {values.sale_price_mad > 0 && costs.margin < 10 && costs.profit >= 0 && (
            <p className="mt-3 text-xs text-amber-600 font-medium">
              ⚠️ Marge inférieure à 10%. Vérifiez la rentabilité du produit.
            </p>
          )}
        </Card>

        {/* Form error */}
        {errors._form && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errors._form}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 justify-end">
          <button
            type="button"
            onClick={() => router.back()}
            disabled={isPending}
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={isPending}
            className={cn(
              "px-6 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium",
              "hover:opacity-90 active:opacity-80 transition-opacity",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {isPending ? "Enregistrement…" : product ? "Mettre à jour" : "Créer le produit"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function Card({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border bg-card p-5 space-y-4", className)}>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children, error, hint, className }: {
  label: string; children: React.ReactNode;
  error?: string; hint?: string; className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
    </div>
  );
}

function Input({ value, onChange, placeholder, className, disabled }: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; className?: string; disabled?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
        "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
    />
  );
}

function NumInput({ value, onChange, disabled }: {
  value: number; onChange: (v: number) => void; disabled?: boolean;
}) {
  return (
    <input
      type="number"
      min="0"
      step="0.01"
      value={value === 0 ? "" : value}
      onChange={(e) => {
        const n = parseFloat(e.target.value);
        onChange(isNaN(n) ? 0 : Math.max(0, n));
      }}
      placeholder="0.00"
      disabled={disabled}
      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
    />
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-base font-bold font-mono", className ?? "text-foreground")}>{value}</p>
    </div>
  );
}
