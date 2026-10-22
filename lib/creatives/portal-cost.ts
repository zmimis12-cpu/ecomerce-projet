/**
 * lib/creatives/portal-cost.ts — coût éditeurs vidéo pour le tableau de bord, selon le mode choisi :
 *   commission → gains figés des commandes payées · salaire / par produit → montant de la période.
 * Les éditeurs supprimés / désactivés ne sont pas comptés. Server only.
 */
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getVideoEditors } from "@/lib/creatives/queries";
import { readPortalConfigs, readEditorVideoUnits, portalEarned, usesCommission, normalizePortalCfg } from "@/lib/creatives/portal";

export async function editorCostForPeriod(
  paidOrders: { creative_id: string | null; editor_earning_mad: number | null }[],
  from: Date | null, to: Date | null,
): Promise<number> {
  const [editors, cfgs, links] = await Promise.all([getVideoEditors(), readPortalConfigs(), readEditorVideoUnits()]);
  const active = new Set(editors.map((e) => e.id));
  const cfgOf = (id: string) => cfgs[id] ?? normalizePortalCfg(null);

  // 1. Commission : commandes payées venant des vidéos des éditeurs payés à la commission
  const crIds = [...new Set(paidOrders.map((o) => o.creative_id).filter(Boolean))] as string[];
  const editorOf = new Map<string, string>();
  for (let i = 0; i < crIds.length; i += 150) {
    const { data } = await supabaseAdmin.from("creatives" as never).select("id, editor_id").in("id", crIds.slice(i, i + 150));
    for (const c of (data ?? []) as { id: string; editor_id: string }[]) editorOf.set(c.id, c.editor_id);
  }
  let total = 0;
  for (const o of paidOrders) {
    const ed = o.creative_id ? editorOf.get(o.creative_id) : undefined;
    if (ed && active.has(ed) && usesCommission(cfgOf(ed))) total += Number(o.editor_earning_mad ?? 0);
  }
  // 2. Salaire / par produit : montant de la période (sans la commission, déjà comptée au-dessus)
  for (const e of editors) {
    const c = cfgOf(e.id);
    if (c.payMode === "commission") continue;
    total += portalEarned({ ...c, plusCommission: false }, 0, links.filter((l) => l.editorId === e.id), from, to);
  }
  return Math.round(total * 100) / 100;
}
