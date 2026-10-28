/**
 * lib/call-center/agent-products.ts — produits attribués à chaque agent call center.
 * call_center_agents.metadata.products = [product_id…] ; liste vide / absente = AUCUN produit (l'admin attribue).
 * Utilisé par l'auto-assignation et les listes de l'agent (il ne voit que ses produits). Server only.
 */
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function readAgentProducts(): Promise<Map<string, string[]>> {
  const { data } = await supabaseAdmin.from("call_center_agents" as never).select("user_id, metadata");
  const out = new Map<string, string[]>();
  for (const r of (data ?? []) as { user_id: string; metadata: Record<string, unknown> | null }[]) {
    const list = Array.isArray(r.metadata?.products) ? (r.metadata!.products as unknown[]).filter((x): x is string => typeof x === "string") : [];
    if (list.length) out.set(r.user_id, list);
  }
  return out;
}

/** L'agent peut-il traiter une commande contenant ces produits ? Aucun produit attribué = non. */
export function agentAllows(map: Map<string, string[]>, agentId: string, productIds: (string | null | undefined)[]): boolean {
  const list = map.get(agentId);
  if (!list || !list.length) return false;
  const ids = productIds.filter(Boolean) as string[];
  return ids.some((id) => list.includes(id));
}

export async function agentProductList(agentId: string): Promise<string[]> {
  return (await readAgentProducts()).get(agentId) ?? [];
}
