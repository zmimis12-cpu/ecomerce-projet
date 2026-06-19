"use client";

import { useState } from "react";
import Image from "next/image";
import type { ProductPerformance } from "@/lib/dashboard/queries";
import { cn } from "@/lib/utils";

interface ProductPerformanceTableProps {
  data: ProductPerformance[];
}

function StatusBadge({ status }: { status: ProductPerformance["performance_status"] }) {
  const config = {
    profitable:   { label: "Rentable",   cls: "bg-green-100 text-green-800 border-green-200" },
    losing:       { label: "Perte",      cls: "bg-red-100 text-red-800 border-red-200" },
    needs_review: { label: "À réviser",  cls: "bg-amber-100 text-amber-800 border-amber-200" },
    no_data:      { label: "Aucune donnée", cls: "bg-gray-100 text-gray-500 border-gray-200" },
  }[status];
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold", config.cls)}>
      {config.label}
    </span>
  );
}

function fmt(n: number) {
  return n.toLocaleString("fr-MA", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function ProductPerformanceTable({ data }: ProductPerformanceTableProps) {
  const [zoomedImage, setZoomedImage] = useState<{ url: string; name: string } | null>(null);

  if (!data.length) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        Aucun produit trouvé.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b bg-secondary/30">
            {[
              "Photo","Produit","SKU","Pub","Leads","Conf.","Livré","Retourné",
              "Tx Conf","Tx Livr","CA Total","CA Réel",
              "Profit Est.","Profit Réel","Marge",
              "Ads Total","Ads Max Est.","Ads Max Réel",
              "Statut"
            ].map((h) => (
              <th key={h} className="text-left px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {data.map((row) => (
            <tr key={row.product_id}
              className={cn(
                "hover:bg-secondary/20 transition-colors",
                row.performance_status === "losing" && "bg-red-50/30"
              )}>
              <td className="px-3 py-2.5">
                {row.image_url ? (
                  <button
                    type="button"
                    onClick={() => setZoomedImage({ url: row.image_url!, name: row.product_name })}
                    className="block w-9 h-9 rounded-md overflow-hidden border hover:opacity-80 transition-opacity relative shrink-0"
                    aria-label={`Agrandir la photo de ${row.product_name}`}
                  >
                    <Image src={row.image_url} alt={row.product_name} fill className="object-cover" unoptimized />
                  </button>
                ) : (
                  <div className="w-9 h-9 rounded-md bg-secondary/40 border flex items-center justify-center text-[9px] text-muted-foreground">
                    N/A
                  </div>
                )}
              </td>
              <td className="px-3 py-2.5 font-medium max-w-[160px] truncate">
                {row.product_name}
              </td>
              <td className="px-3 py-2.5 font-mono text-muted-foreground">{row.sku}</td>
              <td className="px-3 py-2.5 font-mono whitespace-nowrap">
                {fmt(row.ads_cost_mad)}
                <span className={cn(
                  "ms-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
                  row.is_real_ad_spend ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"
                )} title={row.is_real_ad_spend ? "Synchronisé depuis Meta Ads" : "Estimation manuelle"}>
                  {row.is_real_ad_spend ? "réel" : "est."}
                </span>
              </td>
              <td className="px-3 py-2.5 font-mono text-center">{row.lead_count}</td>
              <td className="px-3 py-2.5 font-mono text-center">{row.confirmed_count}</td>
              <td className="px-3 py-2.5 font-mono text-center text-green-700">{row.delivered_count}</td>
              <td className="px-3 py-2.5 font-mono text-center text-red-600">{row.returned_count}</td>
              <td className="px-3 py-2.5 font-mono text-center">
                <span className={cn(
                  "font-semibold",
                  row.confirmation_rate >= 50 ? "text-green-700" : "text-amber-600"
                )}>
                  {row.confirmation_rate}%
                </span>
              </td>
              <td className="px-3 py-2.5 font-mono text-center">
                <span className={cn(
                  "font-semibold",
                  row.delivery_rate >= 70 ? "text-green-700" : "text-amber-600"
                )}>
                  {row.delivery_rate}%
                </span>
              </td>
              <td className="px-3 py-2.5 font-mono text-muted-foreground">{fmt(row.total_revenue)}</td>
              <td className="px-3 py-2.5 font-mono font-semibold">{fmt(row.real_revenue)}</td>
              <td className="px-3 py-2.5 font-mono text-muted-foreground">{fmt(row.estimated_profit)}</td>
              <td className={cn(
                "px-3 py-2.5 font-mono font-bold",
                row.real_profit >= 0 ? "text-green-700" : "text-red-600"
              )}>
                {fmt(row.real_profit)}
              </td>
              <td className="px-3 py-2.5 font-mono text-center">
                <span className={cn(
                  "font-semibold",
                  row.real_margin_pct >= 20 ? "text-green-700" :
                  row.real_margin_pct >= 10 ? "text-amber-600" : "text-red-600"
                )}>
                  {row.real_margin_pct}%
                </span>
              </td>

              {/* Ads Total — total spend on this product */}
              <td className="px-3 py-2.5 font-mono whitespace-nowrap">
                <span className={row.ads_total > 0 ? "text-blue-700 font-semibold" : "text-muted-foreground"}>
                  {fmt(row.ads_total)}
                </span>
              </td>

              {/* Ads Max Estimation — max recommended daily budget at 50% delivery */}
              <td className="px-3 py-2.5 font-mono whitespace-nowrap">
                {row.ads_max_estimation > 0 ? (
                  <span className="text-amber-600 font-semibold">{fmt(row.ads_max_estimation)}/j</span>
                ) : <span className="text-muted-foreground">—</span>}
              </td>

              {/* Ads Max Réel — max daily budget based on real delivery rate */}
              <td className="px-3 py-2.5 font-mono whitespace-nowrap">
                {row.ads_max_real > 0 ? (
                  <span className={cn(
                    "font-semibold",
                    row.ads_max_real >= row.ads_max_estimation ? "text-green-700" : "text-red-600"
                  )}>
                    {fmt(row.ads_max_real)}/j
                  </span>
                ) : <span className="text-muted-foreground">—</span>}
              </td>

              <td className="px-3 py-2.5">
                <StatusBadge status={row.performance_status} />
              </td>
            </tr>
          ))}
        </tbody>
        {/* Totals row */}
        <tfoot className="border-t-2 bg-secondary/20">
          <tr>
            <td className="px-3 py-2.5 font-bold" colSpan={4}>Totaux</td>
            <td className="px-3 py-2.5 font-bold font-mono text-center">
              {data.reduce((s, r) => s + r.lead_count, 0)}
            </td>
            <td className="px-3 py-2.5 font-bold font-mono text-center">
              {data.reduce((s, r) => s + r.confirmed_count, 0)}
            </td>
            <td className="px-3 py-2.5 font-bold font-mono text-center text-green-700">
              {data.reduce((s, r) => s + r.delivered_count, 0)}
            </td>
            <td className="px-3 py-2.5 font-bold font-mono text-center text-red-600">
              {data.reduce((s, r) => s + r.returned_count, 0)}
            </td>
            <td colSpan={2} />
            <td className="px-3 py-2.5 font-bold font-mono">
              {fmt(data.reduce((s, r) => s + r.total_revenue, 0))}
            </td>
            <td className="px-3 py-2.5 font-bold font-mono">
              {fmt(data.reduce((s, r) => s + r.real_revenue, 0))}
            </td>
            <td className="px-3 py-2.5 font-bold font-mono">
              {fmt(data.reduce((s, r) => s + r.estimated_profit, 0))}
            </td>
            <td className={cn(
              "px-3 py-2.5 font-bold font-mono",
              data.reduce((s, r) => s + r.real_profit, 0) >= 0 ? "text-green-700" : "text-red-600"
            )}>
              {fmt(data.reduce((s, r) => s + r.real_profit, 0))}
            </td>
            <td /> {/* Marge */}
            <td className="px-3 py-2.5 font-bold font-mono text-blue-700">
              {fmt(data.reduce((s, r) => s + r.ads_total, 0))}
            </td>
            <td colSpan={3} /> {/* Ads Max Est + Ads Max Réel + Statut */}
          </tr>
        </tfoot>
      </table>

      {zoomedImage && (
        <div
          onClick={() => setZoomedImage(null)}
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6 cursor-zoom-out"
        >
          <div className="relative max-w-lg w-full aspect-square">
            <Image src={zoomedImage.url} alt={zoomedImage.name} fill className="object-contain rounded-lg" unoptimized />
          </div>
          <p className="absolute bottom-8 text-white text-sm font-medium">{zoomedImage.name}</p>
        </div>
      )}
    </div>
  );
}
