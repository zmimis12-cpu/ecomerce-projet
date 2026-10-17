import type { Metadata } from "next";
import { Package } from "lucide-react";
import { loadEditorContext } from "@/lib/creatives/editor-context";
import { getProductCards } from "@/lib/creatives/portal";
import { EditorHeader } from "@/components/creatives/editor-sections";
import { EditorProductCard } from "@/components/creatives/portal-controls";

export const metadata: Metadata = { title: "Mes produits" };
export const dynamic = "force-dynamic";

export default async function EditorProductsPage({
  searchParams,
}: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await loadEditorContext(await searchParams);
  const products = await getProductCards(ctx.portal.productIds);
  const canReview = !ctx.isEditor;

  return (
    <div className="space-y-6">
      <EditorHeader ctx={ctx} title={ctx.isEditor ? "Mes produits" : "Produits & liens"} icon={Package}
        current="/admin/editor/products" withFilter={false} />

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
        {ctx.isEditor
          ? "Voici les produits sur lesquels tu peux travailler. Quand ta vidéo est prête, mets-la sur Google Drive (accès « Tous les utilisateurs disposant du lien »), puis colle le lien sous le produit. Tu peux envoyer plusieurs vidéos par produit."
          : "Produits autorisés pour cet éditeur et liens vidéo envoyés. Les réglages se font dans Vidéos & Éditeurs → Espace éditeurs."}
      </div>

      {products.length === 0 ? (
        <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
          {ctx.isEditor ? "Aucun produit ne t'a encore été attribué." : "Aucun produit autorisé pour cet éditeur."}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((p) => (
            <EditorProductCard key={p.id} product={p}
              links={ctx.links.filter((l) => l.productId === p.id)}
              canSubmit={ctx.isEditor} canReview={canReview} />
          ))}
        </div>
      )}
    </div>
  );
}
