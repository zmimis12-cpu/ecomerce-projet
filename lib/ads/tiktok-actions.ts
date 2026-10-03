"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { saveTikTokApp, tiktokAuthUrl, getTikTokAccounts, saveTikTokAccounts, checkTikTokAccounts } from "./tiktok-accounts";

type R = { success: boolean; error?: string; url?: string; info?: string };
const ADMIN = ["super_admin", "admin"] as const;

export async function saveTikTokAppAction(appId: string, secret: string): Promise<R> {
  await requireRole([...ADMIN]);
  if (!/^\d+$/.test(appId.trim())) return { success: false, error: "App ID = uniquement des chiffres." };
  if (secret.trim().length < 10) return { success: false, error: "Secret invalide." };
  await saveTikTokApp(appId, secret);
  revalidatePath("/admin/settings/ads");
  return { success: true, info: "App TikTok enregistrée." };
}

export async function getTikTokConnectUrl(): Promise<R> {
  await requireRole([...ADMIN]);
  const url = await tiktokAuthUrl();
  return url ? { success: true, url } : { success: false, error: "Enregistre d'abord l'App ID et le Secret." };
}

export async function updateTikTokAccount(key: string, patch: { isActive?: boolean; taxPct?: number | null; pixelCode?: string | null }): Promise<R> {
  await requireRole([...ADMIN]);
  const list = await getTikTokAccounts();
  const a = list.find((x) => x.key === key);
  if (!a) return { success: false, error: "Compte introuvable" };
  Object.assign(a, patch);
  await saveTikTokAccounts(list);
  revalidatePath("/admin/settings/ads");
  return { success: true };
}

export async function removeTikTokAccount(key: string): Promise<R> {
  await requireRole([...ADMIN]);
  await saveTikTokAccounts((await getTikTokAccounts()).filter((a) => a.key !== key));
  revalidatePath("/admin/settings/ads");
  return { success: true };
}

export async function recheckTikTok(): Promise<R> {
  await requireRole([...ADMIN]);
  const r = await checkTikTokAccounts();
  revalidatePath("/admin/settings/ads");
  return { success: true, info: r.map((x) => `${x.label}: ${x.status === "ok" ? "✅" : x.error}`).join(" · ") || "Aucun compte" };
}
