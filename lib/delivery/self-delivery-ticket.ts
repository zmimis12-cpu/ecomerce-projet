"use server";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";

const MANAGER_ROLES = ["super_admin", "admin", "manager"] as const;

/** Génère un code de tracking interne HajtekZone (pas Digylog) */
function generateHZTrackingCode(orderNumber: string): string {
  const clean = orderNumber.replace(/[^A-Z0-9]/gi, "");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `HZ${clean}${rand}`;
}

/**
 * Génère un ticket de livraison PDF 10×10cm, reproduisant la structure en
 * grille/cases bordées d'une vraie étiquette de transporteur (logo/statut,
 * expéditeur/destinataire, tracking+QR+montant, ville, produit, code-barres)
 * — mais en marque HajtekZone, pour les livraisons gérées par ton propre
 * livreur (pas Digylog).
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
    .select("product_name, quantity")
    .eq("order_id", orderId);
  const lineItems = (items ?? []) as { product_name: string; quantity: number }[];
  const productLine = lineItems.map((it) => `${it.quantity}x_${it.product_name}`).join(", ");

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
  const M = 6; // marge extérieure très fine, comme une vraie étiquette
  const W = SZ - 2 * M;
  const X0 = M;
  const X1 = SZ - M;
  const BORDER = rgb(0, 0, 0);
  const GRAY_BG = rgb(0.93, 0.93, 0.93);

  const AR = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;
  function reshapeIfArabic(text: string): string {
    const fixed = text.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').trim();
    if (AR.test(fixed)) {
      try { return reshapeArabic(fixed); } catch { return fixed; }
    }
    return fixed;
  }
  /**
   * Texte arabe mélangé (chiffres, mots latins, parenthèses) : on découpe en
   * segments arabe / non-arabe et on les place nous-mêmes de DROITE à GAUCHE.
   * (pdf-lib/fontkit inverse toute la ligne si elle commence en arabe — « 24 »
   * devenait « 42 » — et rien du tout si elle commence en latin.)
   */
  function rtlSegments(text: string, font: import("pdf-lib").PDFFont, size: number) {
    const clean = text.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').trim();
    const parts = clean.match(/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]+(?:\s+[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]+)*|[^\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]+/g) ?? [];
    return parts.map((seg) => {
      let t: string;
      // Dans une ligne arabe (RTL), la ponctuation/les espaces autour d'un mot latin
      // ou d'un nombre passent de l'autre côté, et les parenthèses sont en miroir.
      const mirror = (x: string) => x.split("").reverse().join("").replace(/[()[\]]/g, (ch) => ({ "(": ")", ")": "(", "[": "]", "]": "[" } as Record<string, string>)[ch]);
      if (AR.test(seg)) { try { t = reshapeArabic(seg); } catch { t = seg; } }
      else if (!/[A-Za-z0-9]/.test(seg)) t = mirror(seg);
      else {
        const m = seg.match(/^([^A-Za-z0-9]*)([\s\S]*?)([^A-Za-z0-9]*)$/) ?? ["", "", seg, ""];
        t = mirror(m[3]) + m[2] + mirror(m[1]);
      }
      return { t, w: font.widthOfTextAtSize(t, size) };
    });
  }
  function measureSmart(text: string, font: import("pdf-lib").PDFFont, size: number) {
    if (!AR.test(text)) return font.widthOfTextAtSize(text.trim(), size);
    return rtlSegments(text, font, size).reduce((a, x) => a + x.w, 0);
  }
  function drawSmart(text: string, xRight: number, y: number, font: import("pdf-lib").PDFFont, size: number, color = rgb(0, 0, 0)) {
    if (!AR.test(text)) {
      const t = text.trim(); const w = font.widthOfTextAtSize(t, size);
      page.drawText(t, { x: xRight - w, y, size, font, color }); return;
    }
    let cursor = xRight;
    for (const seg of rtlSegments(text, font, size)) {
      cursor -= seg.w;
      if (seg.t.trim()) page.drawText(seg.t, { x: cursor, y, size, font, color });
    }
  }
  function textR(text: string, xRight: number, y: number, opts: { bold?: boolean; size?: number; color?: [number, number, number] } = {}) {
    const font = opts.bold ? fontBold : fontNormal;
    const size = opts.size ?? 9;
    drawSmart(text, xRight, y, font, size, opts.color ? rgb(...opts.color) : rgb(0, 0, 0));
    return measureSmart(text, font, size);
  }
  function textL(text: string, xLeft: number, y: number, opts: { bold?: boolean; size?: number; color?: [number, number, number] } = {}) {
    const font = opts.bold ? fontBold : fontNormal;
    const size = opts.size ?? 9;
    // reshapeIfArabic() ne reshape QUE si le texte contient de l'arabe (sinon
    // le renvoie tel quel) — sans ça, les noms clients arabes s'affichaient
    // en lettres déconnectées (ز ه ي ر au lieu de زهير).
    drawSmart(text, xLeft + measureSmart(text, font, size), y, font, size, opts.color ? rgb(...opts.color) : rgb(0, 0, 0));
  }
  function textCenterArabic(text: string, xCenter: number, y: number, opts: { bold?: boolean; size?: number; white?: boolean } = {}) {
    const font = opts.bold ? fontBold : fontNormal;
    const size = opts.size ?? 9;
    const w = measureSmart(text, font, size);
    drawSmart(text, xCenter + w / 2, y, font, size, opts.white ? rgb(1, 1, 1) : rgb(0, 0, 0));
  }
  /** Centre un groupe "texte arabe" + "texte latin" (ex: marque HajtekZone)
   * SANS jamais les mélanger dans un seul appel — sinon le reshaper arabe
   * inverse aussi le latin (bug déjà rencontré: "enoZketjaH" au lieu de
   * "HajtekZone"). Le latin (dernier mot lu, donc le plus à GAUCHE en RTL)
   * est dessiné en premier à gauche, l'arabe reshapé juste à sa droite. */
  function textCenterMixed(arabicText: string, latinText: string, xCenter: number, y: number, opts: { bold?: boolean; size?: number } = {}) {
    const font = opts.bold ? fontBold : fontNormal;
    const size = opts.size ?? 9;
    const gap = 4;
    const arabicShaped = reshapeIfArabic(arabicText);
    const arabicW = font.widthOfTextAtSize(arabicShaped, size);
    const latinW  = font.widthOfTextAtSize(latinText, size);
    const total = arabicW + gap + latinW;
    const startX = xCenter - total / 2;
    page.drawText(latinText, { x: startX, y, size, font, color: rgb(0, 0, 0) });
    page.drawText(arabicShaped, { x: startX + latinW + gap, y, size, font, color: rgb(0, 0, 0) });
  }
  function hLine(y: number) {
    page.drawLine({ start: { x: X0, y }, end: { x: X1, y }, thickness: 0.75, color: BORDER });
  }
  function vLine(x: number, yTop: number, yBottom: number) {
    page.drawLine({ start: { x, y: yTop }, end: { x, y: yBottom }, thickness: 0.75, color: BORDER });
  }
  function outerBox(yTop: number, yBottom: number) {
    page.drawRectangle({ x: X0, y: yBottom, width: W, height: yTop - yBottom, borderColor: BORDER, borderWidth: 1, color: undefined });
  }

  let y = SZ - M;
  const rowH = (h: number) => { const top = y; y -= h; return top; };

  // ── Cadre extérieur global ───────────────────────────────────────────────
  outerBox(SZ - M, M);

  // ── Rangée 1: Logo HajtekZone | Statut/Date ──────────────────────────────
  const row1Top = rowH(30);
  hLine(row1Top - 30);
  const midX1 = X0 + W * 0.55;
  vLine(midX1, row1Top, row1Top - 30);
  textL("HajtekZone", X0 + 6, row1Top - 19, { bold: true, size: 15, color: [0.72, 0.53, 0.04] });
  page.drawRectangle({ x: midX1, y: row1Top - 15, width: X1 - midX1, height: 15, color: rgb(0.09, 0.09, 0.09) });
  textCenterArabic("توصيل داخلي — ليفور خاص", midX1 + (X1 - midX1) / 2, row1Top - 11, { bold: true, size: 8, white: true });
  textCenterArabic(new Date(o.created_at).toLocaleDateString("fr-FR"), midX1 + (X1 - midX1) / 2, row1Top - 26, { size: 9 });

  // ── Rangée 2: Expéditeur | Destinataire ──────────────────────────────────
  const row2Top = row1Top - 30;
  const row2H = 38;
  hLine(row2Top - row2H);
  vLine(midX1, row2Top, row2Top - row2H);
  textL("Expediteur :", X0 + 6, row2Top - 11, { bold: true, size: 8 });
  textL("HajtekZone", X0 + 6, row2Top - 22, { size: 9 });
  textL("Destinataire :", midX1 + 6, row2Top - 11, { bold: true, size: 8 });
  textL(o.customer_name, midX1 + 6, row2Top - 21, { size: 9 });
  // Téléphone du client (le livreur l'appelle) — 0612 34 56 78
  const phoneDigits = String(o.customer_phone ?? "").replace(/\D/g, "").replace(/^212/, "0");
  const phoneFmt = phoneDigits.length === 10 ? `${phoneDigits.slice(0, 4)} ${phoneDigits.slice(4, 6)} ${phoneDigits.slice(6, 8)} ${phoneDigits.slice(8)}` : phoneDigits;
  textL(`Tel : ${phoneFmt}`, midX1 + 6, row2Top - 33, { bold: true, size: 10 });

  // ── Rangée 3: Tracking/ID | QR | Montant ─────────────────────────────────
  const row3Top = row2Top - row2H;
  const row3H = 46;
  const colA = X0 + W * 0.32;
  const colB = X0 + W * 0.68;
  hLine(row3Top - row3H);
  vLine(colA, row3Top, row3Top - row3H);
  vLine(colB, row3Top, row3Top - row3H);
  textL(trackingCode, X0 + 6, row3Top - 22, { bold: true, size: 10 });
  textL(o.order_number, X0 + 6, row3Top - 37, { size: 9 });

  const qrDataUrl = await QRCode.toDataURL(trackingCode, { margin: 0, width: 200 });
  const qrPngBytes = Buffer.from(qrDataUrl.split(",")[1], "base64");
  const qrImage = await doc.embedPng(qrPngBytes);
  const qrSize = 38;
  page.drawImage(qrImage, { x: colA + (colB - colA - qrSize) / 2, y: row3Top - row3H + (row3H - qrSize) / 2, width: qrSize, height: qrSize });

  // Livraison gratuite annoncée au client — on affiche uniquement le prix
  // total de la commande, jamais de "net" après déduction d'un frais.
  textCenterArabic(`${o.total_amount_mad.toFixed(0)} DH`, colB + (X1 - colB) / 2, row3Top - 27, { bold: true, size: 15 });

  // ── Rangée 4: Ville (grande, centrée) ─────────────────────────────────────
  const row4Top = row3Top - row3H;
  const row4H = 18;
  hLine(row4Top - row4H);
  textCenterArabic(o.customer_city.toUpperCase(), SZ / 2, row4Top - 13, { bold: true, size: 12 });

  // ── Rangée 5: Confirmation adresse par téléphone ─────────────────────────
  const row5Top = row4Top - row4H;
  const row5H = 26;
  hLine(row5Top - row5H);
  {
    const addr = (o.customer_address ?? "").replace(/\s+/g, " ").trim() || "العنوان : يتم تأكيده عبر الهاتف";
    const maxW = W - 12, size = 8;
    const lines: string[] = [];
    let cur = "";
    for (const word of addr.split(" ")) {
      const test = cur ? `${cur} ${word}` : word;
      if (measureSmart(test, fontNormal, size) > maxW && cur) { lines.push(cur); cur = word; }
      else cur = test;
    }
    if (cur) lines.push(cur);
    const shown = lines.slice(0, 2);
    if (lines.length > 2) shown[1] = shown[1].slice(0, Math.max(0, shown[1].length - 3)) + "...";
    shown.forEach((ln, i) => textCenterArabic(ln, SZ / 2, row5Top - 10 - i * 10, { bold: i === 0 && shown.length === 1, size }));
  }

  // ── Rangée 6: Produit(s) ─────────────────────────────────────────────────
  const row6Top = row5Top - row5H;
  const row6H = 14;
  hLine(row6Top - row6H);
  textCenterArabic(productLine || "-", SZ / 2, row6Top - 10, { size: 8 });

  // ── Rangée 7: Note (fond gris) ────────────────────────────────────────────
  const row7Top = row6Top - row6H;
  const row7H = 14;
  page.drawRectangle({ x: X0, y: row7Top - row7H, width: W, height: row7H, color: GRAY_BG });
  hLine(row7Top - row7H);
  textCenterMixed("ملحوظة : توصيل داخلي عبر ليفور", "HajtekZone", SZ / 2, row7Top - 10, { size: 7.5 });

  // ── Rangée 8: horodatage + code-barres + référence ───────────────────────
  const row8Top = row7Top - row7H;
  const nowStr = `${trackingCode} - ${new Date().toLocaleDateString("fr-FR")} ${new Date().toLocaleTimeString("fr-FR", {hour:"2-digit",minute:"2-digit"})}`;
  textCenterArabic(nowStr, SZ / 2, row8Top - 10, { size: 7 });

  const barcodePng = await bwipjs.toBuffer({
    bcid: "code128", text: trackingCode, scale: 2, height: 9, includetext: false,
  });
  const barcodeImage = await doc.embedPng(barcodePng);
  const bcW = W - 20, bcH = 26;
  page.drawImage(barcodeImage, { x: X0 + (W - bcW) / 2, y: row8Top - 40, width: bcW, height: bcH });

  textCenterArabic(`${o.order_number} - ${trackingCode}`, SZ / 2, row8Top - 50, { bold: true, size: 8 });

  const bytes = await doc.save();
  const base64 = Buffer.from(bytes).toString("base64");
  return { success: true, base64 };
}
