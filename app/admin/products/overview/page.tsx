import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { getProductPerformance, type DateFilter } from "@/lib/dashboard/queries";
import { ProductPerformanceTable } from "@/components/dashboard/product-performance-table";

export const metadata: Metadata = { title: "Vue d&apos;ensemble Produits" };
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ period?: string }>;
}

const PERIODS: { label: string; days: number }[] = [
  { label: "Aujourd'hui",      days: 1  },
  { label: "7 jours",          days: 7  },
  { label: "30 jours",         days: 30 },
  { label: "90 jours",         days: 90 },
];

export default async function ProductsOverviewPage({ searchParams }: Props) {
  await requireRole(["super_admin", "admin", "manager", "finance"]);

  const { period = "30" } = await searchParams;
  const days = parseInt(period, 10) || 30;

  const now   = new Date();
  const from  = new Date(now.getTime() - days * 86400_000);
  const filter: DateFilter = {
    from: from.toISOString().slice(0, 10),
    to:   now.toISOString().slice(0, 10),
  };

  const products = await getProductPerformance(filter);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Vue d&apos;ensemble Produits</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Performance, coût publicitaire et rentabilité par produit
          </p>
        </div>

        {/* Period filter */}
        <div className="flex gap-1.5 flex-wrap">
          {PERIODS.map((p) => (
            <a key={p.days}
              href={`?period=${p.days}`}
              className={[
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                p.days === days
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              ].join(" ")}>
              {p.label}
            </a>
          ))}
        </div>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <ProductPerformanceTable data={products} />
      </div>
    </div>
  );
}
