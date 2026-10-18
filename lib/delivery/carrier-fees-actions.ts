"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeFees, type CarrierFees } from "./carrier-fees-shared";

export async function saveCarrierFees(fees: CarrierFees): Promise<{ success: boolean; error?: string }> {
  await requireRole(["super_admin", "admin", "manager"]);
  const { error } = await supabaseAdmin.from("app_settings").upsert(
    { key: "carrier_fees", value: JSON.stringify(normalizeFees(fees as never)), category: "delivery", label: "Frais par transporteur" } as never,
    { onConflict: "key" },
  );
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/delivery/compare");
  revalidatePath("/admin");
  return { success: true };
}
