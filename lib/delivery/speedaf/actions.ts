"use server";
/**
 * Actions Speedaf (envoi, étiquette, annulation, réglages). Le appCode ne quitte jamais le serveur.
 */
import { revalidatePath } from "next/cache";
import { PDFDocument } from "pdf-lib";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { normalizePhone } from "@/lib/delivery/phone-utils";
import { SpeedafClient } from "./client";
import { readSpeedafConfig, writeSpeedafConfig, ensureSpeedafCompanyId, getSpeedafCompanyId } from "./config";
import { getSpeedafCities, resolveCity, suggestCities, normCity } from "./areas";
import { DEFAULT_SPEEDAF_CONFIG, type SpeedafConfig } from "./types";
import { syncSpeedafActiveOrders } from "./sync";

const MANAGER = ["super_admin", "admin", "manager"] as const;

// ── Réglages ──────────────────────────────────────────────────────────────────
export async function saveSpeedafConfig(input: SpeedafConfig): Promise<{ success: boolean; error?: string }> {
  await requireRole(["super_admin", "admin"]);
  const current = await readSpeedafConfig();
  const clip = (v: unknown, n = 200) => String(v ?? "").trim().slice(0, n);
  const cfg: SpeedafConfig = {
    ...DEFAULT_SPEEDAF_CONFIG,
    ...current,
    enabled: !!input.enabled,
    env: input.env === "prod" ? "prod" : "uat",
    appCode: clip(input.appCode, 60),
    customerCode: clip(input.customerCode, 60),
    platformSource: clip(input.platformSource, 60),
    // secretKey vide = on garde l'ancien (le champ n'est jamais renvoyé au navigateur)
    secretKey: clip(input.secretKey, 200) || current.secretKey,
    senderName: clip(input.senderName, 100),
    senderMobile: normalizePhone(clip(input.senderMobile, 20)),
    senderAddress: clip(input.senderAddress, 500),
    senderProvince: clip(input.senderProvince, 60),
    senderCity: clip(input.senderCity, 60),
    senderDistrict: clip(input.senderDistrict, 60) || clip(input.senderCity, 60),
    labelType: ([2, 5, 46] as const).includes(Number(input.labelType) as 2 | 5 | 46) ? (Number(input.labelType) as 2 | 5 | 46) : 5,
    isAllowOpen: input.isAllowOpen ? 1 : 0,
    defaultWeightKg: Math.max(0.1, Math.min(30, Number(input.defaultWeightKg) || 1)),
    cityMap: current.cityMap ?? {},
  };
  const { error } = await writeSpeedafConfig(cfg);
  if (error) return { success: false, error: error.message };
  await ensureSpeedafCompanyId();
  revalidatePath("/admin/settings/delivery");
  return { success: true };
}

export async function testSpeedafConnection(): Promise<{ ok: boolean; message: string }> {
  await requireRole([...MANAGER]);
  const cfg = await readSpeedafConfig();
  const cities = await getSpeedafCities(cfg, true);
  return cities.length
    ? { ok: true, message: `Connexion OK (${cfg.env === "prod" ? "production" : "test UAT"}) — ${cities.length} villes Speedaf chargées.` }
    : { ok: false, message: "Speedaf ne répond pas ou appCode invalide." };
}

export async function subscribeSpeedafWebhook(): Promise<{ ok: boolean; message: string }> {
  await requireRole(["super_admin", "admin"]);
  const cfg = await readSpeedafConfig();
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  if (!appUrl) return { ok: false, message: "NEXT_PUBLIC_APP_URL manquant." };
  const url = `${appUrl}/api/webhooks/speedaf`;
  const r = await new SpeedafClient(cfg).subscribeWebhook(url);
  if (!r.ok) return { ok: false, message: r.error };
  await writeSpeedafConfig({ ...cfg, webhookSubscribedAt: new Date().toISOString() });
  return { ok: true, message: `Webhook activé : ${url}` };
}

export async function runSpeedafSyncNow() {
  await requireRole([...MANAGER]);
  return syncSpeedafActiveOrders();
}

/** Liste des villes Speedaf (pour choisir à la main quand la ville n'est pas reconnue). */
export async function listSpeedafCityNames(): Promise<string[]> {
  await requireRole([...MANAGER]);
  const cfg = await readSpeedafConfig();
  const list = await getSpeedafCities(cfg);
  return [...new Set(list.map((c) => c.city))].sort((a, b) => a.localeCompare(b));
}

/** Ville de la commande → ville Speedaf (aperçu avant envoi). */
export async function previewSpeedafCity(orderId: string): Promise<{ city: string; resolved: string | null; suggestions: string[] }> {
  await requireRole([...MANAGER]);
  const { data } = await supabaseAdmin.from("orders").select("customer_city").eq("id", orderId).maybeSingle();
  const city = (data as { customer_city: string } | null)?.customer_city ?? "";
  const cfg = await readSpeedafConfig();
  const list = await getSpeedafCities(cfg);
  const r = resolveCity(city, list, cfg.cityMap);
  return { city, resolved: r?.city ?? null, suggestions: r ? [] : suggestCities(city, list) };
}

// ── Envoi d'une commande ──────────────────────────────────────────────────────
export async function sendOrderToSpeedaf(orderId: string, cityOverride?: string): Promise<{
  success: boolean; tracking?: string; error?: string; needCity?: boolean; suggestions?: string[];
}> {
  await requireRole([...MANAGER]);
  const cfg = await readSpeedafConfig();
  if (!cfg.enabled) return { success: false, error: "Speedaf est désactivé (Paramètres → Livraison → Speedaf)." };
  if (!cfg.customerCode || !cfg.platformSource) return { success: false, error: "Code client / plateforme Speedaf manquants (Paramètres → Livraison)." };
  if (!cfg.senderMobile || !cfg.senderAddress) return { success: false, error: "Adresse et téléphone de l'expéditeur manquants (Paramètres → Livraison → Speedaf)." };

  const { data: od } = await supabaseAdmin.from("orders")
    .select("id, order_number, customer_name, customer_phone, customer_city, customer_address, total_amount_mad, notes, status, delivery_tracking_number, order_items ( quantity, unit_price, product_name, product_sku )")
    .eq("id", orderId).single();
  if (!od) return { success: false, error: "Commande introuvable." };
  type Item = { quantity: number; unit_price?: number | null; product_name: string | null; product_sku: string | null };
  const o = od as unknown as {
    id: string; order_number: string; customer_name: string; customer_phone: string; customer_city: string;
    customer_address: string | null; total_amount_mad: number; notes: string | null; status: string;
    delivery_tracking_number: string | null; order_items: Item[];
  };

  if (o.delivery_tracking_number) return { success: false, error: `Déjà envoyé — tracking: ${o.delivery_tracking_number}` };
  if (o.status !== "confirmed") return { success: false, error: `Statut invalide: "${o.status}". Seules les commandes confirmées peuvent être envoyées.` };
  const phone = normalizePhone(o.customer_phone);
  if (phone.length !== 10 || !phone.startsWith("0")) return { success: false, error: `Téléphone invalide: ${o.customer_phone}` };

  // Ville → région / ville / quartier Speedaf
  const list = await getSpeedafCities(cfg);
  if (!list.length) return { success: false, error: "Impossible de charger les villes Speedaf (connexion ?)." };
  const resolved = cityOverride ? resolveCity(cityOverride, list) : resolveCity(o.customer_city, list, cfg.cityMap);
  if (cityOverride && resolved) {
    // On mémorise le choix : la prochaine commande de cette ville partira toute seule
    await writeSpeedafConfig({ ...cfg, cityMap: { ...cfg.cityMap, [normCity(o.customer_city)]: resolved.city } });
  }
  if (!resolved) {
    return { success: false, needCity: true, suggestions: suggestCities(o.customer_city, list),
      error: `Ville « ${o.customer_city} » introuvable chez Speedaf — choisis la ville Speedaf correspondante.` };
  }

  const items = (o.order_items ?? []).filter((i) => i.quantity > 0);
  const qty = items.reduce((t, i) => t + i.quantity, 0) || 1;
  const itemList = (items.length ? items : [{ quantity: 1, unit_price: o.total_amount_mad, product_name: "Produit", product_sku: "ITEM" }])
    .map((i) => ({
      sku: (i.product_sku || "ITEM").slice(0, 50),
      goodsName: (i.product_name || "Produit").slice(0, 100),
      goodsQTY: i.quantity,
      goodsValue: Math.max(1, Math.round(Number(i.unit_price ?? o.total_amount_mad / qty))),
      currencyType: "MAD",
      goodsType: "IT01",
      goodsWeight: cfg.defaultWeightKg,
      goodsUrl: "",
      blInsure: 0,
      battery: 0,
    }));

  const payload = {
    customOrderNo: o.order_number,
    billCode: "",
    customerCode: cfg.customerCode,
    platformSource: cfg.platformSource,
    parcelType: "PT01",
    deliveryType: "DE01",
    transportType: "TT01",
    shipType: "ST01",
    payMethod: "PA01",
    isAllowOpen: cfg.isAllowOpen,
    acceptName: o.customer_name.slice(0, 100),
    acceptPostCode: "",
    acceptMobile: phone,
    acceptEmail: "",
    acceptAddress: (o.customer_address && o.customer_address.trim()) || o.customer_city,
    acceptCountryCode: "MA",
    acceptCountryName: "Morocco",
    acceptProvinceName: resolved.province,
    acceptCityName: resolved.city,
    acceptDistrictName: resolved.district,
    sendName: cfg.senderName,
    sendAddress: cfg.senderAddress,
    sendMobile: cfg.senderMobile,
    sendCountryCode: "MA",
    sendCountryName: "Morocco",
    sendProvinceName: cfg.senderProvince,
    sendCityName: cfg.senderCity,
    sendDistrictName: cfg.senderDistrict || cfg.senderCity,
    parcelWeight: Math.round(cfg.defaultWeightKg * qty * 1000) / 1000,
    piece: 1,
    goodsQTY: itemList.reduce((t, i) => t + i.goodsQTY, 0),
    codFee: Math.round(Number(o.total_amount_mad) * 100) / 100,
    currencyType: "MAD",
    pickUpAging: 0,
    remark: (o.notes ?? "").slice(0, 200),
    itemList,
  };

  const r = await new SpeedafClient(cfg).createOrder(payload);
  if (!r.ok) return { success: false, error: `Speedaf : ${r.error}` };
  const tracking = r.data?.billCode;
  if (!tracking) return { success: false, error: `Speedaf n'a pas retourné de numéro de suivi${r.data?.message ? ` : ${r.data.message}` : "."}` };

  const companyId = await ensureSpeedafCompanyId();
  const now = new Date().toISOString();
  await Promise.all([
    supabaseAdmin.from("delivery_shipments").upsert({
      order_id: orderId, delivery_company_id: companyId, tracking_number: tracking,
      external_order_id: o.order_number, external_status: "Créé chez Speedaf", external_status_id: 0,
      internal_status: "not_sent", bl_id: null, raw_payload: { carrier: "speedaf", ...r.data } as never, last_synced_at: now,
    } as never, { onConflict: "order_id" }),
    supabaseAdmin.from("orders").update({
      delivery_tracking_number: tracking,
      delivery_company_id: companyId,
      external_delivery_id: o.order_number,
      delivery_external_status: "Créé chez Speedaf",
      delivery_external_status_id: 0,
      delivery_status: "not_sent",
      delivery_last_sync_at: now,
      sent_to_delivery_at: now,
      status: "sent_to_delivery",
      bl_id: null,
    } as never).eq("id", orderId),
  ]);
  await supabaseAdmin.from("order_status_history").insert({
    order_id: orderId, from_status: o.status, to_status: "sent_to_delivery",
    notes: `Envoyée à Speedaf (${resolved.city}) — ${tracking}`,
  } as never).then(() => {}, () => {});

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  return { success: true, tracking };
}

// ── Étiquettes ────────────────────────────────────────────────────────────────
export async function getSpeedafLabels(trackings: string[]): Promise<{ ok: boolean; error?: string; blobBase64?: string }> {
  await requireRole([...MANAGER]);
  const cfg = await readSpeedafConfig();
  const r = await new SpeedafClient(cfg).printLabels(trackings);
  if (!r.ok) return { ok: false, error: `Speedaf : ${r.error}` };
  const labels = r.data?.orderLabels ?? [];
  const pdfs: Uint8Array[] = [];
  for (const l of labels) {
    if (l.labelBase64) pdfs.push(Buffer.from(l.labelBase64, "base64"));
    else if (l.labelUrl) {
      const res = await fetch(l.labelUrl.replace(/^http:/, "https:")).catch(() => null);
      if (res?.ok) pdfs.push(new Uint8Array(await res.arrayBuffer()));
    }
  }
  if (!pdfs.length) return { ok: false, error: "Speedaf n'a renvoyé aucune étiquette." };
  if (pdfs.length === 1) return { ok: true, blobBase64: Buffer.from(pdfs[0]).toString("base64") };
  // Plusieurs étiquettes → un seul PDF
  const merged = await PDFDocument.create();
  for (const bytes of pdfs) {
    const doc = await PDFDocument.load(bytes);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }
  return { ok: true, blobBase64: Buffer.from(await merged.save()).toString("base64") };
}

// ── Annulation ────────────────────────────────────────────────────────────────
export async function cancelSpeedafOrder(orderId: string, reason = "Annulation client"): Promise<{ success: boolean; error?: string }> {
  await requireRole([...MANAGER]);
  const { data } = await supabaseAdmin.from("orders").select("delivery_tracking_number, status").eq("id", orderId).maybeSingle();
  const o = data as { delivery_tracking_number: string | null; status: string } | null;
  if (!o?.delivery_tracking_number) return { success: false, error: "Aucun envoi Speedaf sur cette commande." };
  const cfg = await readSpeedafConfig();
  const r = await new SpeedafClient(cfg).cancelOrder(o.delivery_tracking_number, reason);
  if (!r.ok) return { success: false, error: `Speedaf : ${r.error}` };
  const row = (r.data ?? [])[0];
  if (row && row.success === false) return { success: false, error: `Speedaf : ${row.message ?? "annulation refusée (colis déjà ramassé ?)"}` };
  // La commande redevient « confirmée » et peut être renvoyée (Speedaf ou Digylog)
  await supabaseAdmin.from("orders").update({
    delivery_tracking_number: null, delivery_company_id: null, delivery_external_status: null,
    delivery_external_status_id: null, delivery_status: null, sent_to_delivery_at: null, status: "confirmed",
  } as never).eq("id", orderId);
  await supabaseAdmin.from("delivery_shipments").delete().eq("order_id", orderId);
  await supabaseAdmin.from("order_status_history").insert({
    order_id: orderId, from_status: o.status, to_status: "confirmed", notes: `Envoi Speedaf annulé (${o.delivery_tracking_number})`,
  } as never).then(() => {}, () => {});
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  return { success: true };
}

/** Étiquette du bon transporteur selon la commande (Speedaf ou Digylog). */
export async function getCarrierLabel(tracking: string): Promise<{ ok: boolean; error?: string; blobBase64?: string }> {
  await requireRole([...MANAGER]);
  const speedafId = await getSpeedafCompanyId();
  if (speedafId) {
    const { data } = await supabaseAdmin.from("orders").select("delivery_company_id").eq("delivery_tracking_number", tracking).maybeSingle();
    if ((data as { delivery_company_id: string | null } | null)?.delivery_company_id === speedafId) return getSpeedafLabels([tracking]);
  }
  const { getDigylogLabelUrl } = await import("@/lib/delivery/shipment-actions");
  return getDigylogLabelUrl([tracking]);
}

/** Commande envoyée chez Speedaf ? (pour l'affichage) */
export async function isSpeedafOrder(orderId: string): Promise<boolean> {
  const speedafId = await getSpeedafCompanyId();
  if (!speedafId) return false;
  const { data } = await supabaseAdmin.from("orders").select("delivery_company_id").eq("id", orderId).maybeSingle();
  return (data as { delivery_company_id: string | null } | null)?.delivery_company_id === speedafId;
}
