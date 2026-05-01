import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ImageIcon } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { ProductForm } from "@/components/products/product-form";
import { createProduct } from "@/lib/products/actions";

export const metadata: Metadata = { title: "Nouveau produit" };

export default async function NewProductPage() {
  await requireRole(["super_admin", "admin", "manager"]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link
          href="/admin/products"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Produits
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium">Nouveau produit</span>
      </div>

      <div>
        <h1 className="text-xl font-semibold tracking-tight">Nouveau produit</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Remplissez les informations du produit et sa structure de coûts.
        </p>
      </div>

      {/* Image info banner */}
      <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
        <ImageIcon className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
        <p className="text-sm text-blue-700">
          Les images peuvent être ajoutées après la création du produit.
          Enregistrez d&apos;abord, puis ajoutez vos photos depuis la page du produit.
        </p>
      </div>

      <ProductForm onSubmit={createProduct} />
    </div>
  );
}
