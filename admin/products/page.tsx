import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { getProducts } from "@/lib/products/queries";
import { ProductList } from "@/components/products/product-list";
import { hasRole } from "@/lib/auth/roles";

export const metadata: Metadata = { title: "Produits" };
export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const session = await requireRole(["super_admin", "admin", "manager", "finance", "viewer", "call_center_agent"]);
  const [products] = await Promise.all([getProducts()]);
  const canManage = hasRole(session.role, ["super_admin", "admin", "manager"]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Produits</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gérez votre catalogue de produits et leurs coûts.
        </p>
      </div>
      <ProductList products={products} canManage={canManage} />
    </div>
  );
}
