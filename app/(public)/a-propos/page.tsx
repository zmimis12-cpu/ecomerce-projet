import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "About us — HajtekZone", robots: { index: true } };

export default function AboutPage() {
  return (
    <main style={{ maxWidth: 760, margin: "40px auto", padding: "0 20px", fontFamily: "system-ui,sans-serif", lineHeight: 1.7, color: "#111827" }}>
      <p><Link href="/">← HajtekZone</Link></p>
      <h1>About HajtekZone</h1>
      <p><b>HajtekZone</b> (hajtek.ma) is an e-commerce brand operated by <b>ODT Deals</b>. We sell practical home, wellness and
        technology products to customers in Morocco, with cash on delivery.</p>
      <h2>What we do</h2>
      <ul>
        <li>We select and test useful everyday products (home projectors, massagers, fitness and garden tools…).</li>
        <li>We present each product on a dedicated page with photos, videos, price and a simple order form.</li>
        <li>Every order is confirmed by phone, shipped by professional delivery companies and paid on delivery.</li>
      </ul>
      <h2>Advertising</h2>
      <p>We promote our own products on Meta (Facebook, Instagram) and TikTok. We use internal tools to manage our own ad
        accounts, follow our ad spend and measure conversions (orders) in a privacy-respecting way.</p>
      <h2>Contact</h2>
      <p>Email: <a href="mailto:contact@hajtek.ma">contact@hajtek.ma</a></p>
      <p><Link href="/conditions">Terms of service</Link> · <Link href="/confidentialite">Privacy policy</Link> · <Link href="/suppression-donnees">Data deletion</Link></p>
    </main>
  );
}
