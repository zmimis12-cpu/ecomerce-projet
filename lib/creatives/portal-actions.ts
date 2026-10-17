"use server";
/**
 * lib/creatives/portal-actions.ts — actions de l'espace éditeur :
 * admin → produits autorisés / rémunération / confidentialité ; éditeur → envoi des liens vidéo (Drive…).
 */
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import {
  readPortalConfigs, readVideoLinks, readProductBriefs, writeJson, normalizePortalCfg,
  type EditorPortalCfg, type VideoDelivery, type DeliveryStatus,
} from "./portal";

const MANAGERS = ["super_admin", "admin", "manager"] as const;
type Result = { success: boolean; error?: string };

function refresh() {
  revalidatePath("/admin/creatives");
  revalidatePath("/admin/editor", "layout");
}

export async function saveEditorPortalCfg(editorId: string, cfg: EditorPortalCfg): Promise<Result> {
  await requireRole([...MANAGERS]);
  if (!editorId) return { success: false, error: "Éditeur manquant." };
  const c = normalizePortalCfg(cfg);
  if (c.payMode === "salary" && !c.salaryStart) return { success: false, error: "Choisis la date de début du salaire." };
  const all = await readPortalConfigs();
  all[editorId] = c;
  const { error } = await writeJson("editor_portal", all, "Espace éditeurs (produits, rémunération)");
  if (error) return { success: false, error: error.message };
  refresh();
  return { success: true };
}

/** L'éditeur envoie un ou plusieurs liens pour un produit autorisé. */
export async function submitVideoLinks(input: { productId: string; urls: string[]; note?: string }): Promise<Result> {
  const session = await requireRole(["video_editor"]);
  const editorId = session.authId;
  const cfg = (await readPortalConfigs())[editorId];
  if (!cfg?.productIds.includes(input.productId)) return { success: false, error: "Produit non autorisé." };

  const urls = [...new Set(input.urls.map((u) => u.trim()).filter(Boolean))];
  if (!urls.length) return { success: false, error: "Colle au moins un lien." };
  if (urls.length > 20) return { success: false, error: "Maximum 20 liens à la fois." };
  for (const u of urls) {
    if (!/^https?:\/\/\S+$/i.test(u) || u.length > 500) return { success: false, error: `Lien invalide : ${u.slice(0, 60)}` };
  }
  const all = await readVideoLinks();
  const now = new Date().toISOString();
  const existing = new Set(all.filter((d) => d.editorId === editorId && d.productId === input.productId).map((d) => d.url));
  const fresh: VideoDelivery[] = urls.filter((u) => !existing.has(u)).map((url) => ({
    id: crypto.randomUUID(), editorId, productId: input.productId, url,
    note: (input.note ?? "").trim().slice(0, 300), status: "pending", createdAt: now, reviewedAt: null, adminNote: "",
  }));
  if (!fresh.length) return { success: false, error: "Ces liens sont déjà envoyés." };
  const { error } = await writeJson("editor_video_links", [...fresh, ...all], "Liens vidéos envoyés par les éditeurs");
  if (error) return { success: false, error: error.message };
  refresh();
  return { success: true };
}

/** L'éditeur peut retirer un lien tant qu'il n'est pas validé. */
export async function deleteVideoLink(id: string): Promise<Result> {
  const session = await requireRole(["video_editor", ...MANAGERS]);
  const all = await readVideoLinks();
  const d = all.find((x) => x.id === id);
  if (!d) return { success: false, error: "Introuvable." };
  if (session.role === "video_editor" && (d.editorId !== session.authId || d.status === "accepted"))
    return { success: false, error: "Ce lien est déjà validé." };
  const { error } = await writeJson("editor_video_links", all.filter((x) => x.id !== id), "Liens vidéos envoyés par les éditeurs");
  if (error) return { success: false, error: error.message };
  refresh();
  return { success: true };
}

/** Admin : valider / refuser / remettre en attente. Validé = compte dans la paie « par produit ». */
export async function reviewVideoLink(id: string, status: DeliveryStatus, adminNote = ""): Promise<Result> {
  await requireRole([...MANAGERS]);
  const all = await readVideoLinks();
  const d = all.find((x) => x.id === id);
  if (!d) return { success: false, error: "Introuvable." };
  d.status = status;
  d.reviewedAt = status === "pending" ? null : new Date().toISOString();
  d.adminNote = adminNote.trim().slice(0, 300);
  const { error } = await writeJson("editor_video_links", all, "Liens vidéos envoyés par les éditeurs");
  if (error) return { success: false, error: error.message };
  refresh();
  return { success: true };
}

/** Admin : fiche produit (détails pour que l'éditeur connaisse bien le produit). */
export async function saveProductBrief(productId: string, text: string, links: string): Promise<Result> {
  await requireRole([...MANAGERS]);
  if (!productId) return { success: false, error: "Produit manquant." };
  const all = await readProductBriefs();
  const t = text.trim().slice(0, 8000);
  const l = links.trim().slice(0, 3000);
  if (!t && !l) delete all[productId];
  else all[productId] = { text: t, links: l, updatedAt: new Date().toISOString() };
  const { error } = await writeJson("editor_product_briefs", all, "Fiches produits pour éditeurs vidéo");
  if (error) return { success: false, error: error.message };
  refresh();
  return { success: true };
}
