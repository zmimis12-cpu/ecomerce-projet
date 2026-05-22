/**
 * lib/delivery/store-filter-helper.ts
 * Server-side helper to get stores for filter dropdowns.
 */
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { StoreOption } from "@/components/shared/store-filter";

export async function getStoreOptions(): Promise<StoreOption[]> {
  try {
    const { data } = await supabaseAdmin
      .from("delivery_stores")
      .select("id, name, delivery_companies(slug)")
      .eq("is_active", true)
      .order("name");

    return ((data ?? []) as { id: string; name: string; delivery_companies: { slug: string } | null }[])
      .map((s) => ({
        id:          s.id,
        name:        s.name,
        providerSlug: s.delivery_companies?.slug ?? "unknown",
      }));
  } catch {
    return [];
  }
}
