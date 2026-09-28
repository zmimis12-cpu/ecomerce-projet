/**
 * lib/creatives/payment-queries.ts — lecture paiements + soldes (server only).
 */
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getCreativesReport } from "@/lib/creatives/queries";

export type EditorPayment = {
  id: string;
  editorId: string;
  amount: number;
  paidOn: string;
  method: string;
  reference: string | null;
  note: string | null;
  proofUrl: string | null;   // lien signé valable 1h
  proofIsPdf: boolean;
};

export type EditorBalance = {
  editorId: string;
  name: string;
  earned: number;   // total gagné depuis le début
  paid: number;     // total payé
  remaining: number;
};

export const METHOD_LABEL: Record<string, string> = {
  virement: "Virement", cash: "Espèces", wafacash: "Wafacash", cashplus: "Cash Plus", autre: "Autre",
};

export async function getEditorPayments(editorId?: string | null): Promise<EditorPayment[]> {
  let q = supabaseAdmin
    .from("video_editor_payments" as never)
    .select("id, editor_id, amount, paid_on, method, reference, note, proof_path")
    .order("paid_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (editorId) q = q.eq("editor_id", editorId);
  const { data } = await q;

  type Row = {
    id: string; editor_id: string; amount: number; paid_on: string; method: string;
    reference: string | null; note: string | null; proof_path: string | null;
  };
  const rows = (data ?? []) as unknown as Row[];

  const paths = rows.map((r) => r.proof_path).filter(Boolean) as string[];
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data: urls } = await supabaseAdmin.storage
      .from("editor-payment-proofs")
      .createSignedUrls(paths, 3600);
    for (const u of urls ?? []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
  }

  return rows.map((r) => ({
    id: r.id,
    editorId: r.editor_id,
    amount: Number(r.amount),
    paidOn: r.paid_on,
    method: r.method,
    reference: r.reference,
    note: r.note,
    proofUrl: r.proof_path ? signed.get(r.proof_path) ?? null : null,
    proofIsPdf: !!r.proof_path?.toLowerCase().endsWith(".pdf"),
  }));
}

/** Soldes : gagné (toutes périodes) − payé. */
export async function getEditorBalances(editorId?: string | null): Promise<{
  balances: EditorBalance[];
  payments: EditorPayment[];
}> {
  const [report, payments] = await Promise.all([
    getCreativesReport({ month: "all", editorId }),
    getEditorPayments(editorId),
  ]);
  const balances = report.editors.map((e) => {
    const paid = payments.filter((p) => p.editorId === e.id).reduce((s, p) => s + p.amount, 0);
    return {
      editorId: e.id,
      name: e.name,
      earned: e.earnings,
      paid,
      remaining: Math.round((e.earnings - paid) * 100) / 100,
    };
  });
  return { balances, payments };
}
