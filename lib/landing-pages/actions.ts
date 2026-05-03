"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";

const MANAGER_ROLES = ["super_admin", "admin", "manager"] as const;

export async function toggleLandingPage(id: string, isActive: boolean) {
  await requireRole([...MANAGER_ROLES]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("landing_pages")
    .update({ is_active: isActive } as never)
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/landing-pages");
  return { success: true };
}

export async function upsertLandingPage(id: string | null, data: {
  product_id: string; slug: string; title: string;
  subtitle?: string; description?: string; offer_text?: string;
  meta_pixel_id?: string; tiktok_pixel_id?: string; is_active: boolean;
}) {
  await requireRole([...MANAGER_ROLES]);
  const supabase = await createClient();
  const payload  = { ...data, slug: data.slug.trim().toLowerCase() };

  const { error } = id
    ? await supabase.from("landing_pages").update(payload as never).eq("id", id)
    : await supabase.from("landing_pages").insert(payload as never);

  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/landing-pages");
  return { success: true };
}
