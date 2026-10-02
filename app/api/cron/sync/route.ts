/**
 * GET /api/cron/sync — synchro automatique (toutes les 15 min via Supabase pg_cron).
 * Protégé par CRON_SECRET (header Authorization: Bearer <secret> ou ?secret=).
 *   1. Digylog : statuts exacts + livreur (filet de sécurité du webhook)
 *   2. Dépenses pub Meta / TikTok par produit (jour par jour, 3 derniers jours)
 *   3. Stats par pub → vidéos des éditeurs (impressions, clics, CTR, leads)
 */
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { syncDigylogActiveOrders } from "@/lib/delivery/digylog/auto-sync";
import { syncMetaAdSpendCore, syncTikTokAdSpendCore } from "@/lib/ads/sync-core";
import { syncMetaAdInsights, syncTikTokAdInsights } from "@/lib/ads/insights-sync";
import { syncCreativeStatuses } from "@/lib/ads/meta-status";
import { snapshotEditorEarnings } from "@/lib/creatives/rates";
import { runAdRules } from "@/lib/ads/rules-engine";
import { reportDeliveredToMeta, syncBuyersAudience } from "@/lib/meta/reporting";
import { continuePendingLaunches } from "@/lib/ads/launcher";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function casablancaDay(offsetDays = 0) {
  const d = new Date(Date.now() - offsetDays * 86400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Casablanca" }).format(d); // YYYY-MM-DD
}

async function safe<T>(fn: () => Promise<T>) {
  try { return await fn(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? req.nextUrl.searchParams.get("secret");
  if (!secret || given !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const days = [casablancaDay(0), casablancaDay(1), casablancaDay(2)];
  const only = req.nextUrl.searchParams.get("only"); // "digylog" | "ads" (optionnel)

  const result: Record<string, unknown> = {};

  if (!only || only === "digylog") {
    result.digylog = await safe(() => syncDigylogActiveOrders());
  }
  // Gains éditeurs figés dès qu'une commande vidéo est livrée
  result.editorEarnings = await safe(() => snapshotEditorEarnings());
  // Livraisons → Meta (Purchase) + audience "Acheteurs livrés"
  result.metaPurchases = await safe(() => reportDeliveredToMeta());
  result.metaAudience  = await safe(() => syncBuyersAudience());

  if (!only || only === "ads") {
    // Dépenses par produit : une ligne par jour → pas de double comptage
    // 1ère exécution : on reconstruit 31 jours jour par jour (remplace
    // l'ancienne ligne "1 mois"), ensuite seulement les 3 derniers jours.
    const { data: flag } = await supabaseAdmin
      .from("app_settings").select("value").eq("key", "ads_daily_backfill_done").maybeSingle();
    const backfill = !flag || req.nextUrl.searchParams.get("backfill") === "1";
    const from = backfill ? casablancaDay(31) : days[2];

    const short = (r: unknown) => (r as { ok: boolean }).ok ? "ok" : (r as { error?: string }).error;
    result.metaSpend   = short(await safe(() => syncMetaAdSpendCore(from, days[0])));
    result.tiktokSpend = short(await safe(() => syncTikTokAdSpendCore(from, days[0])));
    result.metaInsights   = await safe(() => syncMetaAdInsights(from, days[0]));
    result.tiktokInsights = await safe(() => syncTikTokAdInsights(from, days[0]));
    result.creativeStatuses = await safe(() => syncCreativeStatuses());
    // Règles automatiques (protection contre les pertes)
    result.adRules = await safe(() => runAdRules());
    // Lancements en attente (vidéos en cours de traitement chez Meta)
    result.launches = await safe(() => continuePendingLaunches());

    if (backfill && result.metaSpend === "ok") {
      await supabaseAdmin.from("app_settings")
        .upsert({
          key: "ads_daily_backfill_done", value: new Date().toISOString(),
          category: "system", label: "Backfill dépenses pub jour par jour",
        } as never, { onConflict: "key" });
      result.backfill = `31 jours reconstruits depuis ${from}`;
    }
  }

  const duration_ms = Date.now() - started;
  await supabaseAdmin.from("auto_sync_runs" as never).insert({ duration_ms, result } as never);
  return NextResponse.json({ ok: true, duration_ms, result });
}
