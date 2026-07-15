import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { LandingPageToggle } from "@/components/landing/landing-page-toggle";
import { CopyUrlButton } from "@/components/landing/copy-url-button";
import { BackfillSectionsButton } from "@/components/landing/backfill-sections-button";
import { Plus, ExternalLink, BarChart3 } from "lucide-react";

export const metadata: Metadata = { title: "Landing Pages" };
export const dynamic = "force-dynamic";

export default async function LandingPagesPage() {
  await requireRole(["super_admin", "admin", "manager"]);
  const supabase = await createClient();

  const { data: pages } = await supabase
    .from("landing_pages")
    .select("id, slug, title, is_active, view_count, order_count, meta_pixel_id, product_id, created_at")
    .order("created_at", { ascending: false });

  const { data: products } = await supabase
    .from("products")
    .select("id, name, slug, sale_price_mad")
    .eq("is_active", true)
    .order("name");

  const lps = (pages ?? []) as unknown as {
    id: string; slug: string; title: string; is_active: boolean;
    view_count: number; order_count: number; meta_pixel_id: string | null; created_at: string;
  }[];

  const productList = (products ?? []) as unknown as {
    id: string; name: string; slug: string; sale_price_mad: number;
  }[];


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Landing Pages</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pages de vente publiques. Créez, activez et partagez le lien dans vos pubs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <BackfillSectionsButton />
          <Link href="/admin/landing-pages/new"
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
            <Plus className="h-4 w-4" /> Nouvelle page
          </Link>
        </div>
      </div>

      {/* Quick create cards */}
      {productList.length > 0 && lps.length === 0 && (
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="text-sm font-semibold">Créer une page pour un produit</h3>
          <p className="text-xs text-muted-foreground">
            Cliquez sur un produit — le formulaire sera pré-rempli automatiquement.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {productList.map((p) => (
              <Link key={p.id} href={`/admin/landing-pages/new?product_id=${p.id}`}
                className="flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm hover:bg-secondary/50 transition-colors group">
                <div className="min-w-0">
                  <p className="font-medium truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.sale_price_mad} MAD</p>
                </div>
                <Plus className="h-4 w-4 text-muted-foreground group-hover:text-foreground shrink-0 ml-2" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Empty */}
      {lps.length === 0 && (
        <div className="rounded-xl border bg-card flex flex-col items-center justify-center py-16 text-center">
          <BarChart3 className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="font-medium text-sm">Aucune landing page</p>
          <p className="text-xs text-muted-foreground mt-1">Créez votre première page de vente.</p>
          <Link href="/admin/landing-pages/new"
            className="mt-4 flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
            <Plus className="h-4 w-4" /> Créer une page
          </Link>
        </div>
      )}

      {/* Table */}
      {lps.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          {/* Quick add bar */}
          <div className="border-b px-4 py-3 flex items-center gap-3 bg-secondary/20">
            <span className="text-xs text-muted-foreground">Ajouter une page pour :</span>
            {productList.slice(0, 4).map((p) => (
              <Link key={p.id} href={`/admin/landing-pages/new?product_id=${p.id}`}
                className="text-xs text-primary hover:underline">
                {p.name}
              </Link>
            ))}
            {productList.length > 4 && (
              <Link href="/admin/landing-pages/new" className="text-xs text-muted-foreground hover:text-foreground">
                +{productList.length - 4} autres →
              </Link>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary/30">
                  {["Titre","URL","Vues","Commandes","Conv.","Pixel","Actif",""].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {lps.map((lp) => {
                  const slug = lp.slug;
                  const conv = lp.view_count === 0 ? "—"
                    : `${((lp.order_count / lp.view_count) * 100).toFixed(1)}%`;
                  return (
                    <tr key={lp.id} className="hover:bg-secondary/20 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-sm">{lp.title}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-muted-foreground">/lp/{lp.slug}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-sm">{lp.view_count}</td>
                      <td className="px-4 py-3 font-mono text-sm text-green-600 font-medium">
                        {lp.order_count}
                      </td>
                      <td className="px-4 py-3 font-mono text-sm">{conv}</td>
                      <td className="px-4 py-3">
                        {lp.meta_pixel_id
                          ? <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">✓ Meta</span>
                          : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <LandingPageToggle id={lp.id} isActive={lp.is_active} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <CopyUrlButton url={`/lp/${slug}`} computeFromOrigin />
                          <a href={`/lp/${slug}`} target="_blank" rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground transition-colors" title="Voir la page">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                          <Link href={`/admin/landing-pages/${lp.id}`}
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap">
                            Modifier
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
