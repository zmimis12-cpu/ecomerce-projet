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
              "Produit","SKU","Leads","Conf.","Livré","Retourné",
              "Tx Conf","Tx Livr","CA Total","CA Réel",
              "Profit Est.","Profit Réel","Marge","Statut"
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
              <td className="px-3 py-2.5 font-medium max-w-[160px] truncate">
                {row.product_name}
              </td>
              <td className="px-3 py-2.5 font-mono text-muted-foreground">{row.sku}</td>
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
              <td className="px-3 py-2.5">
                <StatusBadge status={row.performance_status} />
              </td>
            </tr>
          ))}
        </tbody>
        {/* Totals row */}
        <tfoot className="border-t-2 bg-secondary/20">
          <tr>
            <td className="px-3 py-2.5 font-bold" colSpan={2}>Totaux</td>
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
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
