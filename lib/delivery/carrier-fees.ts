/** Lecture des frais transporteurs + identification du transporteur d'une commande (server only). */
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeFees, type CarrierFees, type CarrierKey } from "./carrier-fees-shared";
export * from "./carrier-fees-shared";

export async function readCarrierFees(): Promise<CarrierFees> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", "carrier_fees").maybeSingle();
  const raw = (data as { value?: unknown } | null)?.value;
  try { return normalizeFees(typeof raw === "string" ? JSON.parse(raw) : (raw as never)); } catch { return normalizeFees(null); }
}

export async function getCarrierResolver() {
  const { data } = await supabaseAdmin.from("delivery_companies").select("id, name");
  const speedaf = new Set(((data ?? []) as { id: string; name: string }[])
    .filter((c) => /speedaf/i.test(c.name)).map((c) => c.id));
  return (o: { delivery_company_id?: string | null; fulfillment_type?: string | null }): CarrierKey =>
    o.fulfillment_type === "self_delivery" ? "self"
      : o.delivery_company_id && speedaf.has(o.delivery_company_id) ? "speedaf" : "digylog";
}
