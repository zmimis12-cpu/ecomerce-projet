import type { Metadata } from "next";
import { Wallet } from "lucide-react";
import { loadEditorContext } from "@/lib/creatives/editor-context";
import { EditorHeader, BalanceCards } from "@/components/creatives/editor-sections";
import { PaymentsList } from "@/components/creatives/payments-list";

export const metadata: Metadata = { title: "Mes paiements" };
export const dynamic = "force-dynamic";

export default async function EditorPaymentsPage({
  searchParams,
}: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await loadEditorContext(await searchParams);
  return (
    <div className="space-y-6">
      <EditorHeader ctx={ctx} title={ctx.isEditor ? "Mes paiements" : "Paiements"} icon={Wallet}
        current="/admin/editor/payments" withFilter={false} />
      <BalanceCards ctx={ctx} />
      <section className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3"><h2 className="font-medium">Historique ({ctx.payments.length})</h2></div>
        <PaymentsList payments={ctx.payments} canDelete={false} />
      </section>
    </div>
  );
}
