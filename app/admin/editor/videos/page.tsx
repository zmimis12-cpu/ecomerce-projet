import type { Metadata } from "next";
import { Film } from "lucide-react";
import { loadEditorContext } from "@/lib/creatives/editor-context";
import { EditorHeader, VideosTable } from "@/components/creatives/editor-sections";

export const metadata: Metadata = { title: "Mes vidéos" };
export const dynamic = "force-dynamic";

export default async function EditorVideosPage({
  searchParams,
}: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await loadEditorContext(await searchParams);
  return (
    <div className="space-y-6">
      <EditorHeader ctx={ctx} title={ctx.isEditor ? "Mes vidéos" : "Vidéos"} icon={Film} current="/admin/editor/videos" />
      <section className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3"><h2 className="font-medium">Vidéos ({ctx.report.creatives.length})</h2></div>
        <VideosTable ctx={ctx} />
      </section>
    </div>
  );
}
