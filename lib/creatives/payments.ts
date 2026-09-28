"use server";
/**
 * lib/creatives/payments.ts — paiements éditeurs vidéo + justificatifs.
 */
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";

const MANAGERS = ["super_admin", "admin", "manager"] as const;
const BUCKET = "editor-payment-proofs";
const MAX_BYTES = 4.5 * 1024 * 1024;
const METHODS = ["virement", "cash", "wafacash", "cashplus", "autre"] as const;

type Result = { success: boolean; error?: string };

export async function addEditorPayment(formData: FormData): Promise<Result> {
  const session = await requireRole([...MANAGERS]);

  const editorId  = String(formData.get("editor_id") ?? "");
  const amount    = Number(formData.get("amount"));
  const paidOn    = String(formData.get("paid_on") ?? "") || new Date().toISOString().slice(0, 10);
  const method    = String(formData.get("method") ?? "virement");
  const reference = String(formData.get("reference") ?? "").trim() || null;
  const note      = String(formData.get("note") ?? "").trim() || null;
  const file      = formData.get("proof") as File | null;

  if (!editorId) return { success: false, error: "Choisis un éditeur." };
  if (!(amount > 0)) return { success: false, error: "Montant invalide." };
  if (!(METHODS as readonly string[]).includes(method)) return { success: false, error: "Méthode invalide." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return { success: false, error: "Date invalide." };

  let proofPath: string | null = null;
  if (file && file.size > 0) {
    if (file.size > MAX_BYTES) return { success: false, error: "Justificatif trop lourd (max 4,5 Mo)." };
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      return { success: false, error: "Justificatif : image ou PDF uniquement." };
    }
    const ext = (file.name.split(".").pop() || (file.type === "application/pdf" ? "pdf" : "jpg")).toLowerCase();
    proofPath = `${editorId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(proofPath, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
    if (upErr) return { success: false, error: `Échec upload : ${upErr.message}` };
  }

  const { error } = await supabaseAdmin.from("video_editor_payments" as never).insert({
    editor_id: editorId, amount, paid_on: paidOn, method, reference, note,
    proof_path: proofPath, created_by: session.authId,
  } as never);
  if (error) {
    if (proofPath) await supabaseAdmin.storage.from(BUCKET).remove([proofPath]);
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/creatives");
  revalidatePath("/admin/editor");
  return { success: true };
}

export async function deleteEditorPayment(id: string): Promise<Result> {
  await requireRole(["super_admin", "admin"]);
  const { data } = await supabaseAdmin
    .from("video_editor_payments" as never)
    .select("proof_path")
    .eq("id", id)
    .maybeSingle();
  const { error } = await supabaseAdmin.from("video_editor_payments" as never).delete().eq("id", id);
  if (error) return { success: false, error: error.message };
  const path = (data as { proof_path: string | null } | null)?.proof_path;
  if (path) await supabaseAdmin.storage.from(BUCKET).remove([path]);
  revalidatePath("/admin/creatives");
  revalidatePath("/admin/editor");
  return { success: true };
}
