/**
 * Liste noire des clients (fake orders) — app_settings « order_blocklist ».
 * Une commande d'un numéro (ou d'une IP, 7 jours max : IP mobiles partagées) bloqué
 * reçoit une réponse « succès » mais n'est PAS enregistrée et ne déclenche aucun pixel.
 */
import { supabaseAdmin } from "@/lib/supabase/admin";

export type BlockEntry = { phone: string; ipHash?: string | null; orderNumber?: string | null; name?: string | null; at: string };

export const BLOCK_IP_DAYS = 7;

export async function loadBlocklist(): Promise<BlockEntry[]> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", "order_blocklist").maybeSingle();
  const v = (data as { value?: { entries?: BlockEntry[] } } | null)?.value;
  return Array.isArray(v?.entries) ? v!.entries : [];
}

export async function saveBlocklist(entries: BlockEntry[]) {
  return supabaseAdmin.from("app_settings").upsert(
    { key: "order_blocklist", value: { entries }, category: "orders", label: "Liste noire clients (fake orders)" } as never,
    { onConflict: "key" });
}

export function isBlocked(entries: BlockEntry[], phone: string, ipHash: string | null): boolean {
  const ipLimit = Date.now() - BLOCK_IP_DAYS * 86400_000;
  return entries.some((e) => e.phone === phone || (!!ipHash && e.ipHash === ipHash && new Date(e.at).getTime() > ipLimit));
}
