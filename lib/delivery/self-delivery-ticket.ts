"use server";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";

const MANAGER_ROLES = ["super_admin", "admin", "manager"] as const;

/** Génère un code de tracking interne HajtekZone (pas Digylog) */
function generateHZTrackingCode(orderNumber: string): string {
  const clean = orderNumber.replace(/[^A-Z0-9]/gi, "");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `HZ-${clean}-${rand}`;
}

/**
 * Génère un ticket de livraison PDF 10×10cm pour une commande livrée par TON
 * PROPRE livreur (pas Digylog) — marque HajtekZone, avec QR code + code-barres
 * de tracking interne générés automatiquement.
 *
 * Calcul: montant à collecter = total_amount_mad. Si un frais de livreur est
 * précisé, le net à remettre au magasin = total - frais.
 */
export async function generateSelfDeliveryTicket(orderId: string, deliveryFee: number = 0): Promise<{
  success: boolean; base64?: string; error?: string;
}> {
  await requireRole([...MANAGER_ROLES]);

  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("order_number, customer_name, customer_phone, customer_city, customer_address, total_amount_mad, notes, created_at")
    .eq("id", orderId)
    .single();
  if (!order) return { success: false, error: "Commande introuvable." };

  const o = order as {
    order_number: string; customer_name: string; customer_phone: string;
    customer_city: string; customer_address: string; total_amount_mad: number;
    notes: string | null; created_at: string;
  };

  const { data: items } = await supabaseAdmin
    .from("order_items")
    .select("product_name, quantity, unit_price")
    .eq("order_id", orderId);
  const lineItems = (items ?? []) as { product_name: string; quantity: number; unit_price: number }[];

  const trackingCode = generateHZTrackingCode(o.order_number);

  const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");
  const arabicReshaper = await import("arabic-reshaper");
  const reshapeArabic = (arabicReshaper.default ?? arabicReshaper).convertArabic;
  const QRCode = await import("qrcode");
  const bwipjs = await import("bwip-js/node");

  const doc = await PDFDocument.create();
  const fontkit = await import("@pdf-lib/fontkit");
  doc.registerFontkit(fontkit.default ?? fontkit);

  let fontBold: import("pdf-lib").PDFFont;
  let fontNormal: import("pdf-lib").PDFFont;
  async function loadFontBytes(filename: string): Promise<Uint8Array> {
    try {
      const fs   = await import("fs");
      const path = await import("path");
      const buf  = fs.readFileSync(path.join(process.cwd(), "public/fonts", filename));
      return new Uint8Array(buf);
    } catch { /* not available locally */ }
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL ?? "http://localhost:3000";
    const url = `${baseUrl.startsWith("http") ? baseUrl : "https://" + baseUrl}/fonts/${filename}`;
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) throw new Error(`Font fetch failed: ${url} → ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
  try {
    fontBold   = await doc.embedFont(await loadFontBytes("Amiri-Bold.ttf"), { subset: false });
    fontNormal = await doc.embedFont(await loadFontBytes("Amiri-Regular.ttf"), { subset: false });
  } catch {
    fontBold   = await doc.embedFont(StandardFonts.HelveticaBold);
    fontNormal = await doc.embedFont(StandardFonts.Helvetica);
  }

  // ── 10cm × 10cm exactement ──────────────────────────────────────────────────
  const SZ = 283.46; // 100mm en points PDF
  const page = doc.addPage([SZ, SZ]);
  const MARGIN = 10;
  const RIGHT = SZ - MARGIN;
  const LEFT  = MARGIN;

  // FIX du bug d'inversion: ne JAMAIS reshaper une ligne qui mélange arabe et
  // latin/chiffres — le reshaper arabe inverse alors TOUT le texte (y compris
  // les chiffres/latin), donnant "58310-CH" au lieu de "CH-01358". On dessine
  // donc le label arabe et la valeur latine comme 2 blocs séparés.
  function reshapeIfArabic(text: string): string {
    const fixed = text.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').trim();
    if (/[\u0600-\u06FF]/.test(fixed)) {
      try { return reshapeArabic(fixed); } catch { return fixed; }
    }
    return fixed;
  }

  /** Dessine "label: valeur" — label arabe (reshapé, aligné à droite) puis
   * valeur latine/numérique (NON reshapée, dans son ordre normal), juste à
   * gauche du label — jamais mélangés dans un seul appel drawText. */
  function labelValue(label: string, value: string, y: number, opts: { size?: number; boldValue?: boolean; valueColor?: [number, number, number] } = {}) {
    const size = opts.size ?? 11;
    const labelText = reshapeIfArabic(label);
    const labelW = fontNormal.widthOfTextAtSize(labelText, size);
    page.drawText(labelText, { x: RIGHT - labelW, y, size, font: fontNormal, color: rgb(0.35, 0.35, 0.35) });

    const valueFont = opts.boldValue ? fontBold : fontNormal;
    const valueW = valueFont.widthOfTextAtSize(value, size);
    page.drawText(value, {
      x: RIGHT - labelW - 6 - valueW, y, size, font: valueFont,
      color: opts.valueColor ? rgb(...opts.valueColor) : rgb(0.1, 0.1, 0.1),
    });
  }

  /** Ligne 100% arabe (titre de section, etc.) — reshaping normal, sûr ici
   * car aucun mélange avec du latin/chiffres. */
  function arabicLine(text: string, y: number, opts: { bold?: boolean; size?: number; color?: [number, number, number] } = {}) {
    const font = opts.bold ? fontBold : fontNormal;
    const size = opts.size ?? 11;
    const t = reshapeIfArabic(text);
    const w = font.widthOfTextAtSize(t, size);
    page.drawText(t, { x: RIGHT - w, y, size, font, color: opts.color ? rgb(...opts.color) : rgb(0.1, 0.1, 0.1) });
  }

  let y = SZ - 18;

  // ── En-tête HajtekZone (PAS Digylog) ──────────────────────────────────────
  page.drawText("HajtekZone", { x: LEFT, y, size: 15, font: fontBold, color: rgb(0.72, 0.53, 0.04) });
  arabicLine("توصيل داخلي", y, { bold: true, size: 12 });
  y -= 16;
  page.drawLine({ start: { x: LEFT, y }, end: { x: RIGHT, y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) });
  y -= 14;

  labelValue("رقم الطلب:", o.order_number, y, { boldValue: true }); y -= 15;
  labelValue("رمز التتبع:", trackingCode, y, { size: 10 }); y -= 15;
  labelValue("التاريخ:", new Date(o.created_at).toLocaleDateString("fr-FR"), y, { size: 10 }); y -= 18;

  arabicLine("معلومات الزبون", y, { bold: true, size: 11 }); y -= 15;
  labelValue("الاسم:", o.customer_name, y, { size: 10 }); y -= 14;
  labelValue("الهاتف:", o.customer_phone, y, { size: 10, boldValue: true }); y -= 14;
  labelValue("المدينة:", o.customer_city, y, { size: 10 }); y -= 14;
  arabicLine(`العنوان: ${o.customer_address}`, y, { size: 9 }); y -= 18;

  arabicLine("المنتج", y, { bold: true, size: 11 }); y -= 15;
  for (const it of lineItems) {
    labelValue(`${it.product_name} ×${it.quantity}`, `${(it.unit_price * it.quantity).toFixed(2)} MAD`, y, { size: 9 });
    y -= 13;
  }
  y -= 8;

  const fee = Math.max(0, deliveryFee);
  const net = o.total_amount_mad - fee;
  arabicLine("المبلغ الواجب تحصيله", y, { bold: true, size: 11 }); y -= 16;
  page.drawText(`${o.total_amount_mad.toFixed(2)} MAD`, { x: RIGHT - fontBold.widthOfTextAtSize(`${o.total_amount_mad.toFixed(2)} MAD`, 18), y, size: 18, font: fontBold, color: rgb(0.09, 0.55, 0.25) });
  y -= 20;
  if (fee > 0) {
    labelValue("أجرة السائق:", `${fee.toFixed(2)} MAD`, y, { size: 10, valueColor: [0.72, 0.53, 0.04] }); y -= 14;
    labelValue("الصافي للمتجر:", `${net.toFixed(2)} MAD`, y, { size: 11, boldValue: true, valueColor: [0.09, 0.3, 0.55] }); y -= 16;
  }

  // ── QR code + code-barres du tracking généré (bas du ticket) ──────────────
  const qrDataUrl = await QRCode.toDataURL(trackingCode, { margin: 0, width: 200 });
  const qrPngBytes = Buffer.from(qrDataUrl.split(",")[1], "base64");
  const qrImage = await doc.embedPng(qrPngBytes);
  const qrSize = 62;
  page.drawImage(qrImage, { x: LEFT, y: 12, width: qrSize, height: qrSize });

  const barcodePng = await bwipjs.toBuffer({
    bcid: "code128", text: trackingCode, scale: 2, height: 10, includetext: false,
  });
  const barcodeImage = await doc.embedPng(barcodePng);
  const bcW = 150, bcH = 34;
  page.drawImage(barcodeImage, { x: RIGHT - bcW, y: 30, width: bcW, height: bcH });
  const trackFont = fontNormal;
  const trackW = trackFont.widthOfTextAtSize(trackingCode, 8);
  page.drawText(trackingCode, { x: RIGHT - trackW, y: 20, size: 8, font: trackFont, color: rgb(0.3, 0.3, 0.3) });

  const bytes = await doc.save();
  const base64 = Buffer.from(bytes).toString("base64");
  return { success: true, base64 };
}
