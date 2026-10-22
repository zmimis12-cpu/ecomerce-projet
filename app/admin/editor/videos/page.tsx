import type { Metadata } from "next";
import { Film } from "lucide-react";
import { loadEditorContext } from "@/lib/creatives/editor-context";
import { getProductCards } from "@/lib/creatives/portal";
import { EditorHeader, ProductGroups } from "@/components/creatives/editor-sections";

export const metadata: Metadata = { title: "Mes vidéos" };
export const dynamic = "force-dynamic";

export default async function EditorVideosPage({
  searchParams,
}: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await loadEditorContext(await searchParams);
  const ids = [...new Set(ctx.report.creatives.map((c) => c.productId).filter(Boolean) as string[])];
  const products = await getProductCards(ids);
  return (
    <div className="space-y-6">
      <EditorHeader ctx={ctx} title={ctx.isEditor ? "Mes vidéos" : "Vidéos"} icon={Film} current="/admin/editor/videos" />
      <p className="text-sm text-muted-foreground">
        {ctx.report.creatives.length} vidéo{ctx.report.creatives.length > 1 ? "s" : ""}, regroupées par produit · les chiffres suivent la période choisie.
      </p>
      <ProductGroups ctx={ctx} products={products} />
    </div>
  );
}
