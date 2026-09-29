import type { Metadata } from "next";
import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { loadEditorContext } from "@/lib/creatives/editor-context";
import { EditorHeader, StatCards, BalanceCards, VideosTable } from "@/components/creatives/editor-sections";

export const metadata: Metadata = { title: "Tableau de bord éditeur" };
export const dynamic = "force-dynamic";

export default async function EditorDashboardPage({
  searchParams,
}: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await loadEditorContext(await searchParams);
  const q = ctx.isEditor ? `?month=${ctx.report.period}` : `?editor=${ctx.editorId}&month=${ctx.report.period}`;
  return (
    <div className="space-y-6">
      <EditorHeader ctx={ctx} title="Tableau de bord" icon={LayoutDashboard} current="/admin/editor" />
      <StatCards ctx={ctx} />
      <BalanceCards ctx={ctx} />
      <section className="rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-medium">Top vidéos (période)</h2>
          <Link href={`/admin/editor/videos${q}`} className="text-xs text-primary hover:underline">Tout voir →</Link>
        </div>
        <VideosTable ctx={ctx} limit={5} />
      </section>
    </div>
  );
}
