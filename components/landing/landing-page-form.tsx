"use client";
import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { upsertLandingPage } from "@/lib/landing-pages/actions";
import { cn } from "@/lib/utils";

interface Product {
  id: string; name: string; slug: string;
  description: string | null; sale_price_mad: number;
}

interface LandingPageFormProps {
  products: Product[];
  preselectedProductId?: string;
  mode?: "create" | "edit";
  defaultValues?: {
    id?: string; product_id?: string; slug?: string; title?: string;
    subtitle?: string; description?: string; offer_text?: string;
    meta_pixel_id?: string; tiktok_pixel_id?: string; is_active?: boolean;
  };
  /** Base URL passed from server — never computed on client to avoid window access */
  appUrl: string;
}

export function LandingPageForm({
  products, preselectedProductId, mode = "create", defaultValues, appUrl,
}: LandingPageFormProps) {
  const router                       = useRouter();
  const [isPending, startTransition] = useTransition();
  const [toast, setToast]            = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [errors, setErrors]          = useState<Record<string, string>>({});

  const [values, setValues] = useState({
    product_id:      defaultValues?.product_id      ?? preselectedProductId ?? "",
    slug:            defaultValues?.slug             ?? "",
    title:           defaultValues?.title            ?? "",
    subtitle:        defaultValues?.subtitle         ?? "",
    description:     defaultValues?.description      ?? "",
    offer_text:      defaultValues?.offer_text       ?? "",
    meta_pixel_id:   defaultValues?.meta_pixel_id    ?? "",
    tiktok_pixel_id: defaultValues?.tiktok_pixel_id  ?? "",
    is_active:       defaultValues?.is_active        ?? true,
  });

  // Auto-fill from selected product (create mode only)
  useEffect(() => {
    if (!values.product_id || mode !== "create") return;
    const p = products.find((p) => p.id === values.product_id);
    if (!p) return;
    setValues((v) => ({
      ...v,
      slug:        v.slug        || p.slug,
      title:       v.title       || p.name,
      description: v.description || p.description || "",
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.product_id]);

  function set(key: string, value: string | boolean) {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => { const n = { ...e }; delete n[key]; return n; });
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!values.product_id)  errs.product_id = "Produit requis.";
    if (!values.slug.trim()) errs.slug        = "Slug requis.";
    if (!values.title.trim()) errs.title      = "Titre requis.";
    if (!/^[a-z0-9-]+$/.test(values.slug)) {
      errs.slug = "Slug: lettres minuscules, chiffres et tirets uniquement.";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    startTransition(async () => {
      const res = await upsertLandingPage(
        mode === "edit" ? (defaultValues?.id ?? null) : null,
        {
          product_id:      values.product_id,
          slug:            values.slug,
          title:           values.title,
          subtitle:        values.subtitle  || undefined,
          description:     values.description || undefined,
          offer_text:      values.offer_text  || undefined,
          meta_pixel_id:   values.meta_pixel_id   || undefined,
          tiktok_pixel_id: values.tiktok_pixel_id  || undefined,
          is_active:       values.is_active,
        }
      );

      if (!res.success) {
        const msg = res.error?.includes("unique")
          ? "Ce slug est déjà utilisé. Choisissez un autre."
          : (res.error ?? "Erreur.");
        setToast({ type: "error", msg });
        return;
      }

      setToast({ type: "success", msg: mode === "create" ? "Page créée !" : "Mis à jour !" });
      setTimeout(() => router.push("/admin/landing-pages"), 800);
    });
  }

  // Preview URL — use appUrl from server prop (safe, no window access needed)
  const previewUrl = values.slug ? `${appUrl}/lp/${values.slug}` : "";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {toast && (
        <div className={cn(
          "rounded-lg px-4 py-3 text-sm font-medium",
          toast.type === "success" ? "bg-green-600 text-white" : "bg-red-50 border border-red-200 text-red-700"
        )}>
          {toast.type === "success" ? "✓ " : "✕ "}{toast.msg}
        </div>
      )}

      {/* Product */}
      <Section title="Produit">
        <Field label="Produit *" error={errors.product_id}>
          <select value={values.product_id} onChange={(e) => set("product_id", e.target.value)}
            className={selectCls(!!errors.product_id)}>
            <option value="">— Sélectionnez un produit —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.sale_price_mad} MAD
              </option>
            ))}
          </select>
        </Field>
      </Section>

      {/* Page config */}
      <Section title="Configuration de la page">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Slug (URL) *" error={errors.slug} className="sm:col-span-2">
            <div className="flex items-center">
              <span className="flex h-10 items-center rounded-l-md border border-r-0 bg-secondary px-3 text-sm text-muted-foreground whitespace-nowrap">
                /lp/
              </span>
              <input type="text" value={values.slug}
                onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                placeholder="nom-du-produit"
                className={cn(inputCls(!!errors.slug), "rounded-l-none")} />
            </div>
            {previewUrl && (
              <div className="flex items-center gap-2 mt-1.5">
                <p className="text-xs text-muted-foreground font-mono truncate flex-1">{previewUrl}</p>
                <a href={previewUrl} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline shrink-0">Aperçu →</a>
              </div>
            )}
          </Field>

          <Field label="Titre (arabe recommandé) *" error={errors.title} className="sm:col-span-2">
            <input type="text" value={values.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="كاشف المعادن الاحترافي 🔍" dir="auto"
              className={inputCls(!!errors.title)} />
          </Field>

          <Field label="Sous-titre">
            <input type="text" value={values.subtitle}
              onChange={(e) => set("subtitle", e.target.value)}
              placeholder="اكتشف الكنوز بسهولة تامة" dir="auto"
              className={inputCls(false)} />
          </Field>

          <Field label="Texte promo (optionnel)">
            <input type="text" value={values.offer_text}
              onChange={(e) => set("offer_text", e.target.value)}
              placeholder="عرض محدود — توصيل مجاني" dir="auto"
              className={inputCls(false)} />
            <p className="text-xs text-muted-foreground mt-1">Affiché en rouge clignotant.</p>
          </Field>

          <Field label="Description" className="sm:col-span-2">
            <textarea value={values.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="وصف تفصيلي للمنتج…" rows={3} dir="auto"
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
          </Field>
        </div>
      </Section>

      {/* Pixels */}
      <Section title="Tracking & Pixels">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Meta Pixel ID">
            <input type="text" value={values.meta_pixel_id}
              onChange={(e) => set("meta_pixel_id", e.target.value)}
              placeholder="123456789012345"
              className={inputCls(false)} />
            <p className="text-xs text-muted-foreground mt-1">
              Facebook → Gestionnaire d&apos;événements → votre pixel → ID
            </p>
          </Field>
          <Field label="TikTok Pixel ID">
            <input type="text" value={values.tiktok_pixel_id}
              onChange={(e) => set("tiktok_pixel_id", e.target.value)}
              placeholder="ABCDE1234567890"
              className={inputCls(false)} />
          </Field>
        </div>
      </Section>

      {/* Status */}
      <Section title="Statut">
        <label className="flex items-center gap-3 cursor-pointer">
          <button type="button" onClick={() => set("is_active", !values.is_active)}
            className={cn(
              "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
              values.is_active ? "bg-green-500" : "bg-slate-300"
            )}>
            <span className={cn(
              "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
              values.is_active ? "translate-x-6" : "translate-x-1"
            )} />
          </button>
          <span className="text-sm font-medium">
            {values.is_active ? "Page active — visible publiquement" : "Page désactivée"}
          </span>
        </label>
      </Section>

      <div className="flex items-center gap-3 justify-end">
        <button type="button" onClick={() => router.back()} disabled={isPending}
          className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50">
          Annuler
        </button>
        <button type="submit" disabled={isPending}
          className="px-6 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50">
          {isPending ? "Sauvegarde…" : mode === "create" ? "Créer la page" : "Enregistrer"}
        </button>
      </div>
    </form>
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

function Field({ label, children, error, className }: {
  label: string; children: React.ReactNode; error?: string; className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</label>
      {children}
      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
    </div>
  );
}

const inputCls = (hasError: boolean) => cn(
  "flex h-10 w-full rounded-md border bg-background px-3 text-sm",
  "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring",
  hasError ? "border-red-400" : "border-input"
);

const selectCls = (hasError: boolean) => cn(
  "flex h-10 w-full rounded-md border bg-background px-3 text-sm",
  "focus:outline-none focus:ring-2 focus:ring-ring",
  hasError ? "border-red-400" : "border-input"
);
