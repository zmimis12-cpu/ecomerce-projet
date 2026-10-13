import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Page d'accueil PUBLIQUE de hajtek.ma (exigée par TikTok/Meta : le site de
 * l'entreprise doit présenter les produits et l'entreprise SANS connexion).
 * Un utilisateur déjà connecté est envoyé directement sur /admin.
 */
export const metadata: Metadata = {
  title: "HajtekZone — Smart products, cash on delivery in Morocco",
  description: "HajtekZone (ODT Deals) sells practical home, wellness and tech products in Morocco with cash on delivery.",
  robots: { index: true, follow: true },
};
export const dynamic = "force-dynamic";

type LP = { slug: string; title: string; hero_image: string | null; price_text: string | null; product_id: string | null };

export default async function HomePage() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) redirect("/admin");
  } catch (e) {
    if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
  }

  const { data: lps } = await supabaseAdmin
    .from("landing_pages").select("slug, title, hero_image, price_text, product_id")
    .eq("is_active", true).order("updated_at", { ascending: false }).limit(12);
  const list = (lps ?? []) as LP[];
  const pids = list.map((l) => l.product_id).filter(Boolean) as string[];
  const imgs = new Map<string, string>();
  const prices = new Map<string, number>();
  if (pids.length) {
    const [{ data: im }, { data: pr }] = await Promise.all([
      supabaseAdmin.from("product_images").select("product_id, public_url, is_primary").in("product_id", pids),
      supabaseAdmin.from("products").select("id, sale_price_mad").in("id", pids),
    ]);
    for (const i of (im ?? []) as { product_id: string; public_url: string; is_primary: boolean }[])
      if (!imgs.has(i.product_id) || i.is_primary) imgs.set(i.product_id, i.public_url);
    for (const p of (pr ?? []) as { id: string; sale_price_mad: number | null }[])
      if (p.sale_price_mad) prices.set(p.id, Number(p.sale_price_mad));
  }

  const wrap: React.CSSProperties = { maxWidth: 1100, margin: "0 auto", padding: "0 20px" };
  return (
    <main style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", color: "#111827", background: "#fff" }}>
      <header style={{ borderBottom: "1px solid #e5e7eb" }}>
        <div style={{ ...wrap, display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
          <strong style={{ fontSize: 20 }}>Hajtek<span style={{ color: "#16a34a" }}>Zone</span></strong>
          <nav style={{ display: "flex", gap: 18, fontSize: 14 }}>
            <a href="#products" style={{ color: "#111827" }}>Products</a>
            <Link href="/a-propos" style={{ color: "#111827" }}>About</Link>
            <a href="#contact" style={{ color: "#111827" }}>Contact</a>
          </nav>
        </div>
      </header>

      <section style={{ background: "#f0fdf4" }}>
        <div style={{ ...wrap, padding: "56px 20px" }}>
          <h1 style={{ fontSize: 36, lineHeight: 1.2, margin: 0 }}>Smart everyday products,<br />delivered to your door in Morocco.</h1>
          <p style={{ fontSize: 17, color: "#374151", maxWidth: 640, marginTop: 14 }}>
            HajtekZone is an online store operated by <b>ODT Deals</b>. We select practical home, wellness and tech products
            and deliver them everywhere in Morocco. You pay cash when you receive your order.
          </p>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 22, fontSize: 14, color: "#065f46" }}>
            <span>✔ Cash on delivery</span><span>✔ Delivery in 24–72 h</span><span>✔ Phone confirmation before shipping</span><span>✔ Exchange if the product is defective</span>
          </div>
        </div>
      </section>

      <section id="products" style={{ ...wrap, padding: "44px 20px" }}>
        <h2 style={{ fontSize: 26, margin: "0 0 20px" }}>Our products</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 18 }}>
          {list.map((l) => {
            const img = l.hero_image || (l.product_id ? imgs.get(l.product_id) : undefined);
            const price = l.product_id ? prices.get(l.product_id) : undefined;
            return (
              <Link key={l.slug} href={`/lp/${l.slug}`} style={{ border: "1px solid #e5e7eb", borderRadius: 14, overflow: "hidden", color: "inherit", textDecoration: "none", display: "block" }}>
                <div style={{ aspectRatio: "1 / 1", background: "#f3f4f6" }}>
                  {img && /* eslint-disable-next-line @next/next/no-img-element */ <img src={img} alt={l.title} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                </div>
                <div style={{ padding: 14 }}>
                  <div style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.35 }}>{l.title}</div>
                  <div style={{ marginTop: 6, color: "#16a34a", fontWeight: 700 }}>{l.price_text || (price ? `${price} MAD` : "")}</div>
                  <div style={{ marginTop: 10, fontSize: 13, color: "#2563eb" }}>View product →</div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section style={{ background: "#f9fafb" }}>
        <div style={{ ...wrap, padding: "44px 20px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 28 }}>
          <div><h3 style={{ marginTop: 0 }}>How to order</h3><p style={{ color: "#4b5563" }}>Choose a product, fill in your name, phone and city. Our team calls you to confirm, then the order is shipped by our delivery partner. You pay on delivery.</p></div>
          <div><h3 style={{ marginTop: 0 }}>Delivery</h3><p style={{ color: "#4b5563" }}>We deliver to all cities in Morocco through professional delivery companies, usually within 24 to 72 hours after confirmation.</p></div>
          <div><h3 style={{ marginTop: 0 }}>Returns &amp; exchange</h3><p style={{ color: "#4b5563" }}>If a product arrives damaged or defective, contact us and we exchange it. See our <Link href="/conditions">terms</Link>.</p></div>
        </div>
      </section>

      <footer id="contact" style={{ borderTop: "1px solid #e5e7eb" }}>
        <div style={{ ...wrap, padding: "30px 20px", fontSize: 14, color: "#4b5563", display: "flex", flexWrap: "wrap", gap: 24, justifyContent: "space-between" }}>
          <div>
            <b style={{ color: "#111827" }}>HajtekZone</b> — operated by ODT Deals<br />
            Email: <a href="mailto:contact@hajtek.ma">contact@hajtek.ma</a><br />
            Website: hajtek.ma
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <Link href="/a-propos">About us</Link>
            <Link href="/conditions">Terms of service</Link>
            <Link href="/confidentialite">Privacy policy</Link>
            <Link href="/suppression-donnees">Data deletion</Link>
            <Link href="/login" style={{ color: "#9ca3af" }}>Staff login</Link>
          </div>
        </div>
        <div style={{ textAlign: "center", fontSize: 12, color: "#9ca3af", paddingBottom: 20 }}>© {new Date().getFullYear()} HajtekZone / ODT Deals. All rights reserved.</div>
      </footer>
    </main>
  );
}
