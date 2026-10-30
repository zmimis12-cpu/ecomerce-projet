/**
 * Parcours LP : 1 appel par visite → compteurs agrégés par jour dans app_settings « lp_funnel_YYYY-MM-DD »
 * (pas de nouvelle table, quelques Ko par jour). Clés : slug et slug|cr (par vidéo).
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type C = Record<string, number>;
const inc = (o: C, k: string, n = 1) => { o[k] = (o[k] ?? 0) + n; };

export async function POST(req: Request) {
  try {
    const b = JSON.parse(await req.text()) as {
      slug?: string; cr?: string; src?: string; s?: number; f?: string[]; c?: number; e?: string[]; ok?: boolean; sec?: number;
    };
    const slug = String(b.slug ?? "").slice(0, 80).replace(/[^\w؀-ۿ-]/g, "");
    if (!slug) return new NextResponse(null, { status: 204 });
    const cr = String(b.cr ?? "").slice(0, 12).replace(/[^\w]/g, "");
    const src = ["ig", "fb", "web"].includes(String(b.src)) ? String(b.src) : "web";
    const s = Math.max(0, Math.min(100, Number(b.s) || 0));
    const fields = Array.isArray(b.f) ? b.f.map(String).slice(0, 10) : [];
    const sec = Math.max(0, Math.min(1800, Number(b.sec) || 0));

    // Jour Maroc
    const day = new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 10);
    const key = `lp_funnel_${day}`;
    const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", key).maybeSingle();
    const all = ((data as { value?: Record<string, C> } | null)?.value ?? {}) as Record<string, C>;

    for (const k of cr ? [slug, `${slug}|${cr}`] : [slug]) {
      const o = (all[k] ??= {});
      inc(o, "visits"); inc(o, `src_${src}`);
      if (sec < 5) inc(o, "bounce5s");
      inc(o, "sec_total", sec);
      if (s >= 25) inc(o, "s25"); if (s >= 50) inc(o, "s50"); if (s >= 75) inc(o, "s75"); if (s >= 95) inc(o, "s100");
      if (fields.length) inc(o, "form_start");
      if (fields.includes("customer_name")) inc(o, "f_name");
      if (fields.includes("customer_phone")) inc(o, "f_phone");
      if (fields.includes("customer_city")) inc(o, "f_city");
      if ((Number(b.c) || 0) > 0) inc(o, "click");
      for (const e of (Array.isArray(b.e) ? b.e : []).slice(0, 5)) inc(o, `err_${String(e).slice(0, 40)}`);
      if (b.ok) inc(o, "ok");
    }
    await supabaseAdmin.from("app_settings").upsert(
      { key, value: all, category: "analytics", label: `Parcours LP ${day}`, description: "Mesure du parcours sur les landing pages" } as never,
      { onConflict: "key" },
    );
  } catch { /* jamais d'erreur côté visiteur */ }
  return new NextResponse(null, { status: 204 });
}
