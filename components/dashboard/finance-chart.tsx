"use client";
import type { DailyFinance } from "@/lib/dashboard/queries";

interface FinanceChartProps {
  data: DailyFinance[];
  metric?: "real_revenue" | "real_profit" | "leads";
}

function fmt(n: number) {
  if (n >= 1000) return `${(n/1000).toFixed(1)}k`;
  return n.toFixed(0);
}

export function FinanceChart({ data, metric = "real_revenue" }: FinanceChartProps) {
  const recent = data.slice(0, 14).reverse();
  if (!recent.length) return (
    <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
      Aucune donnée disponible.
    </div>
  );

  const values = recent.map((d) => d[metric] as number);
  const max    = Math.max(...values, 1);

  const LABELS: Record<typeof metric, string> = {
    real_revenue: "CA Réel (MAD)",
    real_profit:  "Profit Réel (MAD)",
    leads:        "Leads",
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{LABELS[metric]} — 14 derniers jours</p>
      <div className="flex items-end gap-1 h-32">
        {recent.map((d, i) => {
          const val  = d[metric] as number;
          const pct  = max > 0 ? (val / max) * 100 : 0;
          const date = new Date(d.day);
          const lbl  = `${date.getDate()}/${date.getMonth() + 1}`;
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[9px] text-muted-foreground font-mono">{fmt(val)}</span>
              <div className="w-full flex flex-col justify-end" style={{ height:"80px" }}>
                <div
                  className={`w-full rounded-t transition-all ${
                    val >= 0 ? "bg-primary/80 hover:bg-primary" : "bg-red-400 hover:bg-red-500"
                  }`}
                  style={{ height:`${Math.max(pct, 2)}%` }}
                  title={`${d.day}: ${val.toLocaleString()} MAD`}
                />
              </div>
              <span className="text-[9px] text-muted-foreground">{lbl}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
