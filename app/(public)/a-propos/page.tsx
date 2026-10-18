import type { Metadata } from "next";
import { StoreShell, InfoCard, OtherLang } from "@/components/store/store-shell";

export const metadata: Metadata = { title: "من نحن — HajtekZone", description: "HajtekZone (ODT Deals) : produits pratiques livrés partout au Maroc, paiement à la livraison.", robots: { index: true } };

export default function AboutPage() {
  return (
    <StoreShell current="/a-propos" title="من نحن" subtitle="HajtekZone — منتجات عملية لحياة أسهل، بالدفع عند الاستلام فجميع مدن المغرب.">
      <InfoCard icon="🏪" title="شكون حنا؟">
        <p><b className="text-white">HajtekZone</b> (hajtek.ma) متجر إلكتروني مغربي، تابع لشركة <b className="text-white">ODT Deals</b>.
          كنختارو منتجات مفيدة فالحياة اليومية: الدار، الراحة والصحة، والتكنولوجيا.</p>
      </InfoCard>
      <InfoCard icon="✅" title="كيفاش كنخدمو؟">
        <ul className="list-inside list-disc space-y-1">
          <li>كنجربو المنتجات قبل ما نبيعوها، وكنعرضو كل منتج بصور وفيديو وثمن واضح.</li>
          <li>كتدير الطلب فدقيقة، ومن بعد كنعيطو ليك باش نأكدو معاك.</li>
          <li>كنوصلو لجميع مدن المغرب مع شركات توصيل محترفة، غالباً بين 24 و72 ساعة.</li>
          <li>كتخلص غير ملي توصلك الطلبية وتشوفها بعينيك (الدفع عند الاستلام).</li>
        </ul>
      </InfoCard>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["🚚", "توصيل لجميع المدن"], ["💵", "الدفع عند الاستلام"], ["🛡️", "منتجات مضمونة"], ["🎧", "خدمة الزبناء"]].map(([i, t]) => (
          <div key={t} className="rounded-2xl border border-[#D4A93F]/25 bg-[#141414] p-4 text-center">
            <div className="text-2xl">{i}</div><div className="mt-1 text-[13px] font-bold">{t}</div>
          </div>
        ))}
      </div>
      <InfoCard icon="📞" title="تواصل معنا">
        <p>البريد الإلكتروني: <a className="text-[#F3D98B] underline" href="mailto:contact@hajtek.ma">contact@hajtek.ma</a></p>
        <p>ولا راسلنا فالواتساب من الزر الأخضر لتحت.</p>
      </InfoCard>
      <OtherLang label="About us (English)">
        <p><b>HajtekZone</b> (hajtek.ma) is an e-commerce brand operated by <b>ODT Deals</b>. We sell practical home, wellness and technology products to customers in Morocco, with cash on delivery.</p>
        <h3>What we do</h3>
        <p>We select and test useful everyday products, present each one on a dedicated page with photos, videos, price and a simple order form. Every order is confirmed by phone, shipped by professional delivery companies and paid on delivery.</p>
        <h3>Advertising</h3>
        <p>We promote our own products on Meta (Facebook, Instagram) and TikTok, and measure orders in a privacy-respecting way.</p>
        <h3>Contact</h3>
        <p>Email: contact@hajtek.ma</p>
      </OtherLang>
    </StoreShell>
  );
}
