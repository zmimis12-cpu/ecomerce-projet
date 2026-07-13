"use server";
/**
 * lib/whatsapp/actions.ts
 * Envoi automatique du message de confirmation Darija + médias produit
 * quand une nouvelle commande est créée — via Meta WhatsApp Cloud API.
 */
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { toInternationalMorocco } from "@/lib/delivery/phone-utils";
import { sendWhatsAppText, sendWhatsAppMedia, type MetaCreds } from "@/lib/whatsapp/meta-client";

const MANAGER = ["super_admin", "admin", "manager"] as const;

interface WhatsAppSettings {
  id: string;
  provider: string;
  access_token: string;
  phone_number_id: string;
  is_active: boolean;
  message_template: string;
}

async function getSettings(): Promise<WhatsAppSettings | null> {
  const { data } = await supabaseAdmin.from("whatsapp_settings").select("*").limit(1).maybeSingle();
  return data as WhatsAppSettings | null;
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? "");
}

/** Meta veut le numéro SANS "+" (ex: 212612345678) */
function toMetaFormat(phone: string): string {
  return toInternationalMorocco(phone).replace("+", "");
}

/**
 * Appelée automatiquement à la création d'une commande (voir lib/orders/actions.ts)
 * ET manuellement via le bouton "Renvoyer confirmation WhatsApp" sur une commande existante.
 * Best-effort: ne bloque jamais la création de commande si WhatsApp échoue.
 */
export async function sendOrderConfirmationWhatsApp(orderId: string): Promise<{
  sent: boolean; reason?: string; error?: string;
}> {
  try {
    const settings = await getSettings();
    if (!settings || !settings.is_active || !settings.access_token || !settings.phone_number_id) {
      return { sent: false, reason: "WhatsApp non configuré ou désactivé (voir Réglages)." };
    }

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, customer_name, customer_phone, customer_city, customer_address")
      .eq("id", orderId)
      .single();
    if (!order) return { sent: false, reason: "Commande introuvable." };
    const o = order as { id: string; customer_name: string; customer_phone: string; customer_city: string; customer_address: string };

    const { data: items } = await supabaseAdmin
      .from("order_items")
      .select("product_id, product_name, unit_price, quantity")
      .eq("order_id", orderId);
    const firstItem = (items ?? [])[0] as { product_id: string; product_name: string; unit_price: number; quantity: number } | undefined;
    if (!firstItem) return { sent: false, reason: "Commande sans articles." };

    const totalPrice = firstItem.unit_price * firstItem.quantity;
    const phone = toMetaFormat(o.customer_phone);
    const creds: MetaCreds = { accessToken: settings.access_token, phoneNumberId: settings.phone_number_id };

    const text = fillTemplate(settings.message_template, {
      name:    o.customer_name,
      product: firstItem.product_name,
      price:   String(totalPrice),
      city:    o.customer_city,
      address: o.customer_address,
    });

    const textRes = await sendWhatsAppText(creds, phone, text);
    await supabaseAdmin.from("whatsapp_message_log").insert({
      order_id: orderId, phone, message_type: "confirmation_text",
      status: textRes.ok ? "sent" : "failed", error: textRes.error ?? null,
    } as never);

    if (!textRes.ok) return { sent: false, error: textRes.error }; // pas la peine d'envoyer les médias si le texte a échoué

    // Envoi des photos/vidéos "preuve produit" liées à ce produit
    const { data: media } = await supabaseAdmin
      .from("product_whatsapp_media")
      .select("media_url, media_type")
      .eq("product_id", firstItem.product_id)
      .order("display_order");

    let mediaFailed: string | undefined;
    for (const m of (media ?? []) as { media_url: string; media_type: string }[]) {
      const mediaRes = await sendWhatsAppMedia(creds, phone, m.media_url, m.media_type === "video" ? "video" : "image");
      await supabaseAdmin.from("whatsapp_message_log").insert({
        order_id: orderId, phone, message_type: "media",
        status: mediaRes.ok ? "sent" : "failed", error: mediaRes.error ?? null,
      } as never);
      if (!mediaRes.ok) mediaFailed = mediaRes.error;
    }

    return mediaFailed
      ? { sent: true, reason: `Texte envoyé, mais un média a échoué: ${mediaFailed}` }
      : { sent: true };
  } catch (e) {
    // Best-effort total — on log juste, jamais de throw (ne doit jamais casser la création de commande)
    console.error("[whatsapp] sendOrderConfirmationWhatsApp failed:", e);
    return { sent: false, error: e instanceof Error ? e.message : "Erreur inconnue." };
  }
}

/** Wrapper avec vérification de rôle — pour le bouton manuel "Renvoyer" sur une commande existante */
export async function resendOrderConfirmationWhatsApp(orderId: string) {
  await requireRole([...MANAGER]);
  return sendOrderConfirmationWhatsApp(orderId);
}

// ── Réglages ──────────────────────────────────────────────────────────────────
export async function getWhatsAppSettings(): Promise<WhatsAppSettings | null> {
  await requireRole([...MANAGER]);
  return getSettings();
}

export async function saveWhatsAppSettings(data: {
  access_token: string; phone_number_id: string;
  is_active: boolean; message_template: string;
}): Promise<{ success: boolean; error?: string }> {
  await requireRole([...MANAGER]);

  const existing = await getSettings();
  const payload = {
    provider: "meta_cloud",
    access_token: data.access_token.trim(),
    phone_number_id: data.phone_number_id.trim(),
    is_active: data.is_active,
    message_template: data.message_template,
    updated_at: new Date().toISOString(),
  };

  const { error } = existing
    ? await supabaseAdmin.from("whatsapp_settings").update(payload as never).eq("id", existing.id)
    : await supabaseAdmin.from("whatsapp_settings").insert(payload as never);

  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/settings/whatsapp");
  return { success: true };
}

export async function testWhatsAppMessage(toPhone: string): Promise<{ success: boolean; error?: string }> {
  await requireRole([...MANAGER]);
  const settings = await getSettings();
  if (!settings || !settings.access_token) return { success: false, error: "Configure d'abord ton access token et phone_number_id Meta." };

  const creds: MetaCreds = { accessToken: settings.access_token, phoneNumberId: settings.phone_number_id };
  const res = await sendWhatsAppText(creds, toMetaFormat(toPhone), "✅ Test GestionPro — la connexion WhatsApp fonctionne !");
  return res.ok ? { success: true } : { success: false, error: res.error };
}

// ── Médias produit (photos/vidéos preuve) ────────────────────────────────────
export async function listProductWhatsAppMedia(productId: string) {
  await requireRole([...MANAGER]);
  const { data } = await supabaseAdmin
    .from("product_whatsapp_media")
    .select("id, media_url, media_type, storage_path, display_order")
    .eq("product_id", productId)
    .order("display_order");
  return data ?? [];
}

export async function addProductWhatsAppMedia(productId: string, formData: FormData): Promise<{ success: boolean; error?: string }> {
  await requireRole([...MANAGER]);

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { success: false, error: "Fichier requis." };

  const isVideo = file.type.startsWith("video/");
  const ext = file.name.split(".").pop() || (isVideo ? "mp4" : "jpg");
  const path = `whatsapp-media/${productId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabaseAdmin.storage
    .from("whatsapp-media")
    .upload(path, buffer, { contentType: file.type, upsert: false, cacheControl: "31536000" });
  if (uploadError) {
    return { success: false, error: `Échec upload: ${uploadError.message}` };
  }
  const { data: urlData } = supabaseAdmin.storage.from("whatsapp-media").getPublicUrl(path);
  const publicUrl = urlData.publicUrl;

  const { error } = await supabaseAdmin.from("product_whatsapp_media").insert({
    product_id: productId, media_url: publicUrl, media_type: isVideo ? "video" : "image",
    storage_path: path,
  } as never);
  if (error) { await supabaseAdmin.storage.from("whatsapp-media").remove([path]); return { success: false, error: error.message }; }

  revalidatePath(`/admin/products/${productId}`);
  return { success: true };
}

export async function deleteProductWhatsAppMedia(id: string, storagePath: string | null): Promise<{ success: boolean; error?: string }> {
  await requireRole([...MANAGER]);
  if (storagePath) await supabaseAdmin.storage.from("whatsapp-media").remove([storagePath]);
  const { error } = await supabaseAdmin.from("product_whatsapp_media").delete().eq("id", id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
