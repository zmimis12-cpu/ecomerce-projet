"use server";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";

const MANAGER_ROLES = ["super_admin", "admin", "manager"] as const;

/**
 * Génère un ticket de livraison PDF simple pour une commande livrée par TON
 * PROPRE livreur (pas Digylog). Contrairement à Digylog, il n'y a pas de frais
 * de livraison à déduire — ton livreur collecte le prix total du produit,
 * pas de partage avec un transporteur tiers.
 *
 * Calcul: montant à collecter = total_amount_mad (prix produit intégral).
 */
export async function generateSelfDeliveryTicket(orderId: string): Promise<{
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

  const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");
  const arabicReshaper = await import("arabic-reshaper");
  const reshapeArabic = (arabicReshaper.default ?? arabicReshaper).convertArabic;

  function pdfSafe(text: string): string {
    const fixed = text
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, "-")
      .trim();
    if (/[\u0600-\u06FF]/.test(fixed)) {
      try { return reshapeArabic(fixed); } catch { return fixed; }
    }
    return fixed;
  }

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

  const doc = await PDFDocument.create();
  const fontkit = await import("@pdf-lib/fontkit");
  doc.registerFontkit(fontkit.default ?? fontkit);

  let fontBold: import("pdf-lib").PDFFont;
  let fontNormal: import("pdf-lib").PDFFont;
  try {
    fontBold   = await doc.embedFont(await loadFontBytes("Amiri-Bold.ttf"), { subset: false });
    fontNormal = await doc.embedFont(await loadFontBytes("Amiri-Regular.ttf"), { subset: false });
  } catch {
    fontBold   = await doc.embedFont(StandardFonts.HelveticaBold);
    fontNormal = await doc.embedFont(StandardFonts.Helvetica);
  }

  const page = doc.addPage([420, 595]); // A5-ish portrait, assez pour un ticket
  const RIGHT = 400; // on écrit depuis la droite (RTL)
  let y = 560;

  function line(text: string, opts: { bold?: boolean; size?: number; color?: [number, number, number] } = {}) {
    const font = opts.bold ? fontBold : fontNormal;
    const size = opts.size ?? 11;
    const w = font.widthOfTextAtSize(pdfSafe(text), size);
    page.drawText(pdfSafe(text), {
      x: RIGHT - w, y, size, font,
      color: opts.color ? rgb(...opts.color) : rgb(0.1, 0.1, 0.1),
    });
    y -= (opts.size ?? 11) + 8;
  }

  line("توصيل داخلي — ليس عبر Digylog", { bold: true, size: 16, color: [0.72, 0.53, 0.04] });
  line(`رقم الطلب: ${o.order_number}`, { bold: true, size: 13 });
  line(`التاريخ: ${new Date(o.created_at).toLocaleDateString("fr-FR")}`);
  y -= 8;
  line("معلومات الزبون", { bold: true, size: 13 });
  line(`الاسم: ${o.customer_name}`);
  line(`الهاتف: ${o.customer_phone}`);
  line(`المدينة: ${o.customer_city}`);
  line(`العنوان: ${o.customer_address}`);
  y -= 8;
  line("المنتج", { bold: true, size: 13 });
  for (const it of lineItems) {
    line(`${it.product_name} × ${it.quantity} — ${(it.unit_price * it.quantity).toFixed(2)} درهم`);
  }
  if (o.notes) {
    y -= 4;
    line(`ملاحظات: ${o.notes}`, { size: 10 });
  }
  y -= 12;
  // Montant à collecter — mis en avant, gros et encadré visuellement (couleur)
  line("المبلغ الواجب تحصيله", { bold: true, size: 13 });
  line(`${o.total_amount_mad.toFixed(2)} درهم`, { bold: true, size: 22, color: [0.09, 0.55, 0.25] });
  y -= 20;
  line("توقيع الزبون: ________________", { size: 11 });
  y -= 4;
  line("توقيع الليفور: ________________", { size: 11 });

  const bytes = await doc.save();
  const base64 = Buffer.from(bytes).toString("base64");
  return { success: true, base64 };
}
