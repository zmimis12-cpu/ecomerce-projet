/**
 * lib/creatives/editor-context.ts — données communes aux pages de l'espace éditeur.
 * Un éditeur ne voit QUE ses données ; un admin peut consulter un éditeur via ?editor=
 */
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { getCreativesReport } from "@/lib/creatives/queries";
import { getEditorBalances } from "@/lib/creatives/payment-queries";
import { currentMonth } from "@/components/creatives/period-filter";

export async function loadEditorContext(sp: Record<string, string>) {
  const session = await requireRole(["video_editor", "super_admin", "admin", "manager"]);
  const isEditor = session.role === "video_editor";
  const editorId = isEditor ? session.authId : (sp.editor || null);
  if (!editorId) redirect("/admin/creatives");

  const month = sp.month ?? currentMonth();
  const [report, { balances, payments }] = await Promise.all([
    getCreativesReport({ month, editorId }),
    getEditorBalances(editorId),
  ]);
  const me = report.editors[0];
  const bal = balances[0] ?? { earned: 0, paid: 0, remaining: 0 };
  const commissionLabel = me
    ? me.commissionType === "percent"
      ? `${me.commissionValue}% par commande livrée`
      : `${me.commissionValue} MAD par commande livrée`
    : "—";

  return { session, isEditor, editorId, month, report, me, bal, payments, commissionLabel };
}

export type EditorContext = Awaited<ReturnType<typeof loadEditorContext>>;
