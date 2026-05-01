import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getProduct } from "@/lib/products/queries";
import { ProductForm } from "@/components/products/product-form";
import { ImageManager } from "@/components/products/image-manager";
import { updateProduct } from "@/lib/products/actions";
import { hasRole } from "@/lib/auth/roles";
import { formatMAD } from "@/types/products";
import { cn } from "@/lib/utils";
import { DeleteProductButton } from "@/components/products/delete-product-button";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const product = await getProduct(id);
  return { title: product ? `${product.name} — Produits` : "Produit introuvable" };
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireRole([
    "super_admin", "admin", "manager", "finance", "viewer",
  ]);
  const product = await getProduct(id);
  if (!product) notFound();

  const canManage = hasRole(session.role, ["super_admin", "admin", "manager"]);

  async function handleUpdate(formData: FormData) {
    "use server";
    return updateProduct(id, formData);
  }

  const profit = product.estimated_profit_mad ?? 0;
  const margin = product.margin_pct ?? 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link
            href="/admin/products"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Produits
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium truncate max-w-[200px]">
            {product.name}
          </span>
        </div>

        {/* Delete button — client component to avoid onClick in server component */}
        {canManage && (
          <DeleteProductButton productId={id} productName={product.name} />
        )}
      </div>

      {/* Header stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Prix de vente"   value={formatMAD(product.sale_price_mad)} />
        <StatCard label="Coût total"      value={formatMAD(product.total_cost_mad)} />
        <StatCard
          label="Profit estimé"
          value={formatMAD(profit)}
          className={profit >= 0 ? "text-green-600" : "text-red-600"}
        />
        <StatCard
          label="Marge"
          value={`${margin.toFixed(1)}%`}
          className={
            margin >= 20 ? "text-green-600" :
            margin >= 10 ? "text-amber-600" :
            "text-red-600"
          }
        />
      </div>

      {/* Status badge */}
      <div className="flex items-center gap-2">
        <span className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
          product.is_active
            ? "bg-green-100 text-green-800"
            : "bg-slate-100 text-slate-600"
        )}>
          <span className={cn(
            "h-1.5 w-1.5 rounded-full",
            product.is_active ? "bg-green-500" : "bg-slate-400"
          )} />
          {product.is_active ? "Actif" : "Inactif"}
        </span>
        <span className="text-xs text-muted-foreground font-mono">
          SKU: {product.sku}
        </span>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form — 2/3 */}
        <div className="lg:col-span-2">
          {canManage ? (
            <ProductForm product={product} onSubmit={handleUpdate} />
          ) : (
            <ReadOnlyProduct product={product} />
          )}
        </div>

        {/* Images — 1/3 */}
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <h3 className="text-sm font-semibold">Images du produit</h3>
            {canManage ? (
              <ImageManager
                productId={product.id}
                images={product.images ?? []}
              />
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {(product.images ?? []).map((img) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={img.id}
                    src={img.public_url}
                    alt=""
                    className="rounded-lg aspect-square object-cover w-full"
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label, value, className,
}: {
  label: string; value: string; className?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-bold font-mono", className ?? "text-foreground")}>
        {value}
      </p>
    </div>
  );
}

function ReadOnlyProduct({
  product,
}: {
  product: import("@/types/products").Product;
}) {
  const fields = [
    { label: "Nom",           value: product.name },
    { label: "SKU",           value: product.sku },
    { label: "Slug",          value: product.slug ?? "—" },
    { label: "Description",   value: product.description ?? "—" },
    { label: "Prix de vente", value: formatMAD(product.sale_price_mad) },
    { label: "Prix d'achat",  value: formatMAD(product.purchase_price_mad) },
    { label: "Emballage",     value: formatMAD(product.packaging_cost_mad) },
    { label: "Confirmation",  value: formatMAD(product.confirmation_cost_mad) },
    { label: "Livraison",     value: formatMAD(product.shipping_cost_mad) },
    { label: "Publicité",     value: formatMAD(product.ads_cost_mad) },
    { label: "Autres coûts",  value: formatMAD(product.other_costs_mad) },
  ];

  return (
    <div className="rounded-xl border bg-card p-5 space-y-3">
      <h3 className="text-sm font-semibold">Détails du produit</h3>
      <div className="divide-y">
        {fields.map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between py-2.5">
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className="text-sm font-medium">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
