"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { getMetaAccounts, saveMetaAccounts, checkMetaAccounts, type MetaAccount } from "./meta-accounts";

type R = { success: boolean; error?: string; info?: string };
const ADMIN = ["super_admin", "admin"] as const;

export async function addMetaAccount(input: { label: string; token: string; adAccountId?: string; pixelId?: string; makePrimary: boolean }): Promise<R> {
  await requireRole([...ADMIN]);
  if (!input.token.trim()) return { success: false, error: "Token obligatoire." };
  const list = await getMetaAccounts();
  const acc: MetaAccount = {
    key: crypto.randomUUID(), label: input.label.trim() || "Nouveau compte Meta",
    adAccountId: input.adAccountId?.replace(/\D/g, "") || null, token: input.token.trim(),
    isActive: true, isPrimary: false, autoPrimary: input.makePrimary, pixelId: input.pixelId?.replace(/\D/g, "") || null, status: "pending",
  };
  await saveMetaAccounts([...list, acc]);
  const res = await checkMetaAccounts();
  revalidatePath("/admin/settings/ads");
  const me = res.find((x) => x.key === acc.key);
  return { success: true, info: me?.status === "ok" ? "✅ Compte connecté." : `⏳ Ajouté. ${me?.error ?? ""}` };
}

export async function updateMetaAccount(key: string, patch: Partial<Pick<MetaAccount, "isActive" | "isPrimary" | "label" | "pixelId" | "adAccountId">>): Promise<R> {
  await requireRole([...ADMIN]);
  const list = await getMetaAccounts();
  for (const a of list) {
    if (patch.isPrimary) a.isPrimary = a.key === key;
    if (a.key === key) Object.assign(a, { ...patch, isPrimary: patch.isPrimary ?? a.isPrimary });
  }
  await saveMetaAccounts(list);
  revalidatePath("/admin/settings/ads");
  return { success: true };
}

export async function removeMetaAccount(key: string): Promise<R> {
  await requireRole([...ADMIN]);
  const list = (await getMetaAccounts()).filter((a) => a.key !== key);
  if (list.length && !list.some((a) => a.isPrimary)) list[0].isPrimary = true;
  await saveMetaAccounts(list);
  revalidatePath("/admin/settings/ads");
  return { success: true };
}

export async function recheckMetaAccounts(): Promise<R> {
  await requireRole([...ADMIN]);
  const r = await checkMetaAccounts();
  revalidatePath("/admin/settings/ads");
  return { success: true, info: r.map((x) => `${x.label}: ${x.status === "ok" ? "✅" : x.error ?? x.status}`).join(" · ") };
}
