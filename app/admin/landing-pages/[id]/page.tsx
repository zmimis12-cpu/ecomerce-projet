import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { LPBuilderForm } from "@/components/landing-builder/lp-builder-form";

export const metadata: Metadata = { title: "Modifier Landing Page" };
export const dynamic = "force-dynamic";

export default async function EditLandingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole(["super_admin", "admin", "manager"]);
  const supabase = await createClient();

  const { data: lp } = await supabase
    .from("landing_pages")
    .select("*")
    .eq("id", id)
    .single();

  if (!lp) notFound();

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
        <span className="text-sm font-medium truncate">{(lp as { title: string }).title}</span>
      </div>
      <h1 className="text-xl font-semibold tracking-tight">Modifier la page</h1>
      <LPBuilderForm
        products={(products ?? []) as unknown as { id: string; name: string; slug: string; sale_price_mad: number }[]}
        mode="edit"
        defaultValues={lp as unknown as Record<string, unknown>}
      />
    </div>
  );
}
