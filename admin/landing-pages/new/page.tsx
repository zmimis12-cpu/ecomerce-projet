import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { LPBuilderForm } from "@/components/landing-builder/lp-builder-form";

export const metadata: Metadata = { title: "Nouvelle Landing Page" };

export default async function NewLandingPage({
  searchParams,
}: {
  searchParams: Promise<{ product_id?: string }>;
}) {
  await requireRole(["super_admin", "admin", "manager"]);
  const params   = await searchParams;
  const supabase = await createClient();

  const { data: products } = await supabase
    .from("products")
    .select("id, name, slug, sale_price_mad")
    .eq("is_active", true)
    .order("name");

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/admin/landing-pages"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="h-4 w-4" /> Landing Pages
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium">Nouvelle page</span>
      </div>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Nouveau Builder</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Sélectionnez un produit + template, puis générez avec l&apos;IA.
        </p>
      </div>
      <LPBuilderForm
        products={(products ?? []) as unknown as { id: string; name: string; slug: string; sale_price_mad: number }[]}
        mode="create"
        defaultValues={params.product_id ? { product_id: params.product_id } : undefined}
      />
    </div>
  );
}
