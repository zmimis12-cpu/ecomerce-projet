"use server";
import { revalidateTag, revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { BumpConfig } from "./catalog";

/** Enregistre les upsells « en même temps » : { productId: [{product_id, price, label}] } */
export async function saveStoreBumps(cfg: Record<string, BumpConfig[]>): Promise<{ success: boolean; error?: string }> {
  await requireRole(["super_admin", "admin", "manager"]);
  const clean: Record<string, BumpConfig[]> = {};
  for (const [pid, list] of Object.entries(cfg)) {
    const l = (list ?? [])
      .filter((b) => b.product_id && b.product_id !== pid && Number(b.price) > 0)
      .slice(0, 3)
      .map((b) => ({ product_id: b.product_id, price: Math.round(Number(b.price)), ...(b.label?.trim() ? { label: b.label.trim().slice(0, 80) } : {}) }));
    if (l.length) clean[pid] = l;
  }
  const { error } = await supabaseAdmin.from("app_settings").upsert(
    { key: "store_bumps", value: JSON.stringify(clean), category: "store", label: "Upsells boutique (order bumps)" } as never,
    { onConflict: "key" },
  );
  if (error) return { success: false, error: error.message };
  revalidateTag("store");
  revalidatePath("/lp/[slug]", "page");
  revalidatePath("/");
  return { success: true };
}
