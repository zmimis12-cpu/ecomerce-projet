"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toggleProductStatus } from "@/lib/products/actions";
import { formatMAD } from "@/types/products";
import { cn } from "@/lib/utils";
import type { ProductListItem } from "@/types/products";
import { Package, Plus, Edit2, TrendingUp, TrendingDown, ImageIcon, ZoomIn } from "lucide-react";

interface ProductListProps {
  products: ProductListItem[];
  canManage: boolean;
}

export function ProductList({ products, canManage }: ProductListProps) {
  const [items, setItems] = useState(products);
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [lightbox, setLightbox] = useState<string | null>(null);

  const filtered = items.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase())
  );

  function handleToggle(id: string, current: boolean) {
    startTransition(async () => {
      const result = await toggleProductStatus(id, !current);
      if (result.success) {
        setItems((prev) =>
          prev.map((p) => (p.id === id ? { ...p, is_active: !current } : p))
        );
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="Aperçu"
            className="max-w-full max-h-full rounded-xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute top-4 right-4 text-white bg-white/20 hover:bg-white/40 rounded-full h-9 w-9 flex items-center justify-center text-lg font-bold transition-colors"
            onClick={() => setLightbox(null)}
          >
            ✕
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par nom ou SKU…"
          className="flex h-9 flex-1 max-w-sm rounded-lg border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span>{filtered.length} produit{filtered.length !== 1 ? "s" : ""}</span>
        </div>
        {canManage && (
          <Link
            href="/admin/products/new"
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" />
            Nouveau produit
          </Link>
        )}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="rounded-xl border bg-card flex flex-col items-center justify-center py-16 text-center">
          <Package className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="font-medium text-sm">
            {search ? "Aucun produit trouvé" : "Aucun produit encore"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {search ? "Essayez un autre terme de recherche." : "Créez votre premier produit."}
          </p>
          {!search && canManage && (
            <Link
              href="/admin/products/new"
              className="mt-4 flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Créer un produit
            </Link>
          )}
        </div>
      )}

      {/* Table */}
      {filtered.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Produit</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">SKU</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Prix vente</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Coût total</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Profit</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Marge</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Statut</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((product) => {
                  const profit = product.estimated_profit_mad ?? 0;
                  const margin = product.margin_pct ?? 0;
                  const isProfit = profit >= 0;

                  return (
                    <tr key={product.id} className="hover:bg-secondary/20 transition-colors">
                      {/* Product cell */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {/* Thumbnail — cliquable */}
                          <div className="relative group/thumb shrink-0">
                            <div className="h-10 w-10 rounded-lg overflow-hidden border bg-secondary/30 flex items-center justify-center">
                              {product.primary_image_url ? (
                                <>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={product.primary_image_url}
                                    alt={product.name}
                                    className="h-full w-full object-cover"
                                  />
                                  {/* Zoom overlay */}
                                  <button
                                    type="button"
                                    onClick={() => setLightbox(product.primary_image_url!)}
                                    className="absolute inset-0 bg-black/50 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center rounded-lg"
                                    title="Agrandir"
                                  >
                                    <ZoomIn className="h-4 w-4 text-white" />
                                  </button>
                                </>
                              ) : (
                                <ImageIcon className="h-4 w-4 text-muted-foreground/40" />
                              )}
                            </div>
                          </div>

                          <div className="min-w-0">
                            <p className="font-medium truncate max-w-[180px]">{product.name}</p>
                            {product.slug && (
                              <p className="text-xs text-muted-foreground font-mono truncate max-w-[180px]">
                                {product.slug}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {product.sku}
                      </td>

                      <td className="px-4 py-3 text-right font-mono font-medium">
                        {formatMAD(product.sale_price_mad)}
                      </td>

                      <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                        {formatMAD(product.total_cost_mad)}
                      </td>

                      <td className="px-4 py-3 text-right font-mono">
                        <span className={cn(
                          "flex items-center justify-end gap-1",
                          isProfit ? "text-green-600" : "text-red-600"
                        )}>
                          {isProfit
                            ? <TrendingUp className="h-3 w-3" />
                            : <TrendingDown className="h-3 w-3" />}
                          {formatMAD(profit)}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-right">
                        <span className={cn(
                          "inline-block rounded-full px-2 py-0.5 text-xs font-medium font-mono",
                          margin >= 20 ? "bg-green-100 text-green-800" :
                          margin >= 10 ? "bg-amber-100 text-amber-800" :
                          "bg-red-100 text-red-800"
                        )}>
                          {margin.toFixed(1)}%
                        </span>
                      </td>

                      <td className="px-4 py-3 text-center">
                        {canManage ? (
                          <button
                            type="button"
                            onClick={() => handleToggle(product.id, product.is_active)}
                            disabled={isPending}
                            className={cn(
                              "relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50",
                              product.is_active ? "bg-green-500" : "bg-slate-300"
                            )}
                          >
                            <span className={cn(
                              "inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform",
                              product.is_active ? "translate-x-[18px]" : "translate-x-1"
                            )} />
                          </button>
                        ) : (
                          <span className={cn(
                            "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                            product.is_active
                              ? "bg-green-100 text-green-700"
                              : "bg-slate-100 text-slate-500"
                          )}>
                            {product.is_active ? "Actif" : "Inactif"}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/products/${product.id}`}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                          {canManage ? "Éditer" : "Voir"}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
