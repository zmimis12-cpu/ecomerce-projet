import type { AdSpendPlatformRow } from "@/lib/dashboard/queries";

function mad(n: number) {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " MAD";
}

const PLATFORM_COLORS: Record<string, string> = {
  meta: "bg-blue-50 text-blue-700",
  tiktok: "bg-gray-100 text-gray-800",
  google: "bg-red-50 text-red-700",
  other: "bg-gray-50 text-gray-600",
};

export function AdSpendByPlatform({ rows, grandTotal }: { rows: AdSpendPlatformRow[]; grandTotal: number }) {
  if (rows.length === 0) return null;

  return (
    <div className="rounded-xl border bg-card p-5 space-y-3">
      <h3 className="text-sm font-semibold">Dépense pub par plateforme</h3>
      <div className="divide-y">
        {rows.map((r) => (
          <div key={r.platform} className="flex items-center justify-between py-2 text-sm">
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${PLATFORM_COLORS[r.platform] ?? "bg-gray-50 text-gray-600"}`}>
              {r.label}
            </span>
            <div className="text-right">
              <div className="font-semibold">{mad(r.total_mad)}</div>
              {r.unmatched_mad > 0 && (
                <div className="text-[11px] text-muted-foreground">
                  dont {mad(r.unmatched_mad)} non attribué
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between pt-2 border-t font-bold text-sm">
        <span>Total toutes plateformes</span>
        <span>{mad(grandTotal)}</span>
      </div>
    </div>
  );
}
