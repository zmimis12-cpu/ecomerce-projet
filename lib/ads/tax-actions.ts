"use server";
/**
 * Réglage de la taxe Meta (TVA) : Meta ne l'expose pas dans l'API, donc on la
 * saisit ici. À l'enregistrement, toutes les dépenses pub déjà stockées sont
 * recalculées (avec taxe à partir de la date de début, sans taxe avant).
 */
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getMetaTaxConfig, taxFactorFor } from "./fx";

export async function saveMetaTax(pct: number, since: string): Promise<{ success: boolean; error?: string; info?: string }> {
  await requireRole(["super_admin", "admin"]);
  if (!(pct >= 0 && pct <= 50)) return { success: false, error: "Taxe entre 0 et 50 %." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) return { success: false, error: "Date invalide." };
  const old = await getMetaTaxConfig();
  const next = { pct, since };

  for (const [key, value, label] of [
    ["meta_tax_pct", String(pct), "Taxe Meta (TVA) en %"],
    ["meta_tax_since", since, "Taxe Meta appliquée depuis"],
  ] as const) {
    await supabaseAdmin.from("app_settings").upsert({ key, value, category: "ads", label } as never, { onConflict: "key" });
  }

  // Recalcul des dépenses déjà stockées (jour par jour)
  let n = 0;
  const tables: { table: string; dayCol: string }[] = [
    { table: "product_ad_spend", dayCol: "period_start" },
    { table: "unmatched_ad_spend", dayCol: "period_start" },
    { table: "ad_insights_daily", dayCol: "day" },
  ];
  for (const t of tables) {
    const keyCols = t.table === "ad_insights_daily" ? "platform, ad_id, day" : "id";
    const { data } = await supabaseAdmin.from(t.table as never)
      .select(`${keyCols}, ${t.dayCol}, spend_mad`).eq("platform", "meta").limit(20000);
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      const day = String(r[t.dayCol]);
      const factor = taxFactorFor(day, next) / taxFactorFor(day, old);
      if (Math.abs(factor - 1) < 1e-9) continue;
      const spend = Math.round(Number(r.spend_mad) * factor * 100) / 100;
      let q = supabaseAdmin.from(t.table as never).update({ spend_mad: spend } as never);
      q = t.table === "ad_insights_daily"
        ? q.eq("platform", "meta").eq("ad_id", String(r.ad_id)).eq("day", day)
        : q.eq("id", String(r.id));
      await q;
      n++;
    }
  }
  revalidatePath("/admin/ads/stats");
  revalidatePath("/admin");
  return { success: true, info: `Taxe enregistrée. ${n} ligne(s) de dépense recalculée(s).` };
}
