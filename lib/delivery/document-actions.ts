"use server";
/**
 * lib/delivery/document-actions.ts
 * Server actions for downloading Digylog documents directly by ID.
 * Token never reaches the browser.
 */
import { requireRole } from "@/lib/auth/session";
import { createDigylogClientFromDB } from "./digylog/client";

const MANAGER = ["super_admin", "admin", "manager"] as const;

/** Download BL PDF directly by Digylog BL ID (e.g. 861409) */
export async function getBlPdfByBlId(blId: number): Promise<{
  ok: boolean; blobBase64?: string; error?: string;
}> {
  await requireRole([...MANAGER]);
  if (!blId || isNaN(blId)) return { ok: false, error: "BL ID invalide." };

  const client = await createDigylogClientFromDB();
  const result = await client.downloadBlPdf(blId);
  if (!result.ok || !result.blob) return { ok: false, error: result.error ?? "Erreur téléchargement BL." };

  const buf = await result.blob.arrayBuffer();
  return { ok: true, blobBase64: Buffer.from(buf).toString("base64") };
}

/** Download labels PDF for a list of tracking numbers */
export async function getLabelsByTrackings(trackings: string[], format: 1 | 2 | 3 | 4 | 5 = 3): Promise<{
  ok: boolean; blobBase64?: string; error?: string;
}> {
  await requireRole([...MANAGER]);
  if (!trackings.length) return { ok: false, error: "Aucun tracking fourni." };

  const client = await createDigylogClientFromDB();
  const result = await client.downloadLabels({ orders: trackings, format });
  if (!result.ok || !result.blob) return { ok: false, error: result.error ?? "Erreur téléchargement étiquettes." };

  const buf = await result.blob.arrayBuffer();
  return { ok: true, blobBase64: Buffer.from(buf).toString("base64") };
}
