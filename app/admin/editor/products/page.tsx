import type { Metadata } from "next";
import { Package } from "lucide-react";
import { loadEditorContext } from "@/lib/creatives/editor-context";
import { getProductCards, readProductBriefs } from "@/lib/creatives/portal";
import { EditorHeader } from "@/components/creatives/editor-sections";
import { ProductsWorkspace } from "@/components/creatives/products-workspace";

export const metadata: Metadata = { title: "Mes produits" };
export const dynamic = "force-dynamic";

export default async function EditorProductsPage({
  searchParams,
}: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await loadEditorContext(await searchParams, { light: true });
  const [products, briefs] = await Promise.all([getProductCards(ctx.portal.productIds), readProductBriefs()]);

  return (
    <div className="space-y-4">
      <EditorHeader ctx={ctx} title={ctx.isEditor ? "Mes produits" : "Produits & liens"} icon={Package}
        current="/admin/editor/products" withFilter={false} />

      <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
        {ctx.isEditor
          ? "Choisis un produit à gauche. Vidéo prête → mets-la sur Google Drive (accès « Tous les utilisateurs disposant du lien »), puis colle le lien. Plusieurs vidéos par produit possibles."
          : "Produits autorisés pour cet éditeur et liens envoyés. Réglages : Vidéos & Éditeurs → Espace éditeurs."}
      </p>

      {products.length === 0 ? (
        <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
          {ctx.isEditor ? "Aucun produit ne t'a encore été attribué." : "Aucun produit autorisé pour cet éditeur."}
        </p>
      ) : (
        <ProductsWorkspace products={products} links={ctx.links} briefs={briefs}
          canSubmit={ctx.isEditor} canReview={!ctx.isEditor} />
      )}
    </div>
  );
}
