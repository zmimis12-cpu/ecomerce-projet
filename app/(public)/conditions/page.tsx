import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Terms of service — HajtekZone", robots: { index: true } };

export default function TermsPage() {
  return (
    <main style={{ maxWidth: 760, margin: "40px auto", padding: "0 20px", fontFamily: "system-ui,sans-serif", lineHeight: 1.7, color: "#111827" }}>
      <p><Link href="/">← HajtekZone</Link></p>
      <h1>Terms of service</h1>
      <p>These terms apply to purchases made on hajtek.ma, operated by ODT Deals under the brand HajtekZone. Last update: October 2026.</p>
      <h2>1. Orders</h2>
      <p>You place an order by filling in the form on a product page. Every order is confirmed by phone or WhatsApp before shipping.
        We may cancel an order that cannot be confirmed.</p>
      <h2>2. Prices and payment</h2>
      <p>Prices are shown in Moroccan dirhams (MAD), delivery included unless stated otherwise. Payment is made in cash to the
        delivery agent upon receipt (cash on delivery).</p>
      <h2>3. Delivery</h2>
      <p>We deliver throughout Morocco through professional delivery companies, usually within 24 to 72 hours after confirmation.
        Delays may vary depending on the city.</p>
      <h2>4. Exchange and returns</h2>
      <p>If a product is damaged or defective on arrival, contact us within 7 days at contact@hajtek.ma: we will exchange it.
        You may refuse a parcel at delivery if it does not match your order.</p>
      <h2>5. Personal data</h2>
      <p>See our <Link href="/confidentialite">privacy policy</Link> and <Link href="/suppression-donnees">data deletion</Link> page.</p>
      <h2>6. Contact</h2>
      <p>Email: <a href="mailto:contact@hajtek.ma">contact@hajtek.ma</a></p>
    </main>
  );
}
