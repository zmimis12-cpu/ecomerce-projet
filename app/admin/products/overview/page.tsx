import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { getProductPerformance, type DateFilter } from "@/lib/dashboard/queries";
import { ProductPerformanceTable } from "@/components/dashboard/product-performance-table";
import { ProductsFilterBar } from "@/components/products/products-filter-bar";

export const metadata: Metadata = { title: "Vue d'ensemble Produits" };
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}

export default async function ProductsOverviewPage({ searchParams }: Props) {
  await requireRole(["super_admin", "admin", "manager", "finance"]);

  const params = await searchParams;
  const now    = new Date();

  let from: string;
  let to: string;

  if (params.from && params.to) {
    // Custom date range chosen by user
    from = params.from;
    to   = params.to;
  } else {
    // Preset period (default 30 days)
    const days = parseInt(params.period ?? "30", 10) || 30;
    from = new Date(now.getTime() - days * 86400_000).toISOString().slice(0, 10);
    to   = now.toISOString().slice(0, 10);
  }

  const filter: DateFilter = { from, to };
  const products = await getProductPerformance(filter);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Vue d&apos;ensemble Produits</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Performance, coût publicitaire et rentabilité par produit
        </p>
      </div>

      <ProductsFilterBar activePeriod={params.period ?? "30"} from={from} to={to} />

      <div className="rounded-xl border bg-card overflow-hidden">
        <ProductPerformanceTable data={products} />
      </div>
    </div>
  );
}
