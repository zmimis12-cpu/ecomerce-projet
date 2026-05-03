import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { LandingPageForm } from "@/components/landing/landing-page-form";

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
    .select("id, name, slug, description, sale_price_mad")
    .eq("is_active", true)
    .order("name");

  const page = lp as unknown as {
    id: string; product_id: string; slug: string; title: string;
    subtitle: string | null; description: string | null; offer_text: string | null;
    meta_pixel_id: string | null; tiktok_pixel_id: string | null; is_active: boolean;
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/admin/landing-pages"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="h-4 w-4" /> Landing Pages
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium truncate">{page.title}</span>
      </div>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Modifier la page</h1>
      </div>
      <LandingPageForm
        products={(products ?? []) as unknown as { id: string; name: string; slug: string; description: string | null; sale_price_mad: number }[]}
        mode="edit"
        defaultValues={{
          id:              page.id,
          product_id:      page.product_id,
          slug:            page.slug,
          title:           page.title,
          subtitle:        page.subtitle ?? "",
          description:     page.description ?? "",
          offer_text:      page.offer_text ?? "",
          meta_pixel_id:   page.meta_pixel_id ?? "",
          tiktok_pixel_id: page.tiktok_pixel_id ?? "",
          is_active:       page.is_active,
        }}
      />
    </div>
  );
}
