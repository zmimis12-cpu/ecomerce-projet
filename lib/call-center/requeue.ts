/**
 * « Pas de réponse » → redevient « Nouvelle » chez la confirmatrice à l'heure du rappel,
 * plusieurs fois par jour (délais des rappels auto), seulement pendant les heures d'appel
 * et pour les commandes de moins de N jours (réglable : Call Center → Agents, cc_callback_rules).
 * L'historique (tentatives, notes, journal d'appels) est conservé. Appelé par le cron (15 min).
 */
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeCallbackRules, maHour } from "@/lib/call-center/callback-rules";

export async function requeueNoAnswerOrders(): Promise<{ ok: true; requeued: number; skipped?: string }> {
  const { data: row } = await supabaseAdmin.from("app_settings").select("value").eq("key", "cc_callback_rules").maybeSingle();
  const rules = normalizeCallbackRules((row as { value?: unknown } | null)?.value);
  if (!rules.enabled || !rules.requeueAsNew) return { ok: true, requeued: 0, skipped: "off" };
  const now = new Date();
  const h = maHour(now);
  if (h < rules.hourStart || h >= rules.hourEnd) return { ok: true, requeued: 0, skipped: "hors heures" };
  const since = new Date(now.getTime() - rules.requeueDays * 86400000).toISOString();
  const { data } = await supabaseAdmin.from("orders")
    .select("id, call_attempts")
    .eq("status", "no_answer")
    .is("delivery_tracking_number", null)
    .gte("created_at", since)
    .not("callback_scheduled_at", "is", null)
    .lte("callback_scheduled_at", now.toISOString())
    .limit(200);
  const ids = ((data ?? []) as { id: string; call_attempts: number | null }[])
    .filter((o) => (o.call_attempts ?? 0) < rules.maxAttempts).map((o) => o.id);
  if (ids.length === 0) return { ok: true, requeued: 0 };
  const { error } = await supabaseAdmin.from("orders").update({ status: "new" } as never).in("id", ids).eq("status", "no_answer");
  if (error) throw new Error(error.message);
  return { ok: true, requeued: ids.length };
}
