import type { Metadata } from "next";
import Link from "next/link";
import { StoreShell, InfoCard, OtherLang } from "@/components/store/store-shell";

export const metadata: Metadata = { title: "شروط البيع والاسترجاع — HajtekZone", robots: { index: true } };

export default function TermsPage() {
  return (
    <StoreShell current="/conditions" title="شروط البيع والاسترجاع" subtitle="هاد الشروط كتطبق على جميع الطلبيات فـ hajtek.ma (ODT Deals). آخر تحديث: أكتوبر 2026.">
      <InfoCard icon="🛒" title="1. الطلب">
        <p>كتدير الطلب من صفحة المنتج بملء الاستمارة. كل طلب كنأكدوه معاك بالهاتف ولا الواتساب قبل الإرسال. إلا ما قدرناش نأكدو الطلب، يمكن نلغيوه.</p>
      </InfoCard>
      <InfoCard icon="💵" title="2. الأثمنة والأداء">
        <p>الأثمنة بالدرهم المغربي، والتوصيل داخل فالثمن إلا إذا تذكر العكس. كتخلص نقداً لعامل التوصيل ملي توصلك الطلبية (الدفع عند الاستلام).</p>
      </InfoCard>
      <InfoCard icon="🚚" title="3. التوصيل">
        <p>كنوصلو لجميع مدن المغرب مع شركات توصيل محترفة، غالباً بين 24 و72 ساعة من بعد التأكيد. المدة كتختلف شوية على حسب المدينة.</p>
      </InfoCard>
      <InfoCard icon="🔄" title="4. الاستبدال والاسترجاع">
        <p>تقدر تشوف الطلبية قبل ما تخلص، وتقدر ترفضها إلا ما كانتش مطابقة للطلب ديالك.</p>
        <p>إلا وصلك منتج مكسور ولا فيه عيب، تواصل معنا خلال 7 أيام فالواتساب ولا فـ contact@hajtek.ma، ونبدلوه ليك.</p>
      </InfoCard>
      <InfoCard icon="🔒" title="5. المعطيات الشخصية">
        <p>شوف <Link className="text-[#F3D98B] underline" href="/confidentialite">سياسة الخصوصية</Link> و<Link className="text-[#F3D98B] underline" href="/suppression-donnees">حذف المعطيات</Link>.</p>
      </InfoCard>
      <InfoCard icon="📞" title="6. التواصل">
        <p>البريد الإلكتروني: <a className="text-[#F3D98B] underline" href="mailto:contact@hajtek.ma">contact@hajtek.ma</a></p>
      </InfoCard>
      <OtherLang label="Terms of service (English)">
        <p>These terms apply to purchases made on hajtek.ma, operated by ODT Deals under the brand HajtekZone. Last update: October 2026.</p>
        <h3>1. Orders</h3><p>You place an order by filling in the form on a product page. Every order is confirmed by phone or WhatsApp before shipping. We may cancel an order that cannot be confirmed.</p>
        <h3>2. Prices and payment</h3><p>Prices are in Moroccan dirhams (MAD), delivery included unless stated otherwise. Payment is made in cash to the delivery agent upon receipt (cash on delivery).</p>
        <h3>3. Delivery</h3><p>We deliver throughout Morocco through professional delivery companies, usually within 24 to 72 hours after confirmation.</p>
        <h3>4. Exchange and returns</h3><p>You may refuse a parcel at delivery if it does not match your order. If a product is damaged or defective on arrival, contact us within 7 days: we will exchange it.</p>
        <h3>5. Contact</h3><p>Email: contact@hajtek.ma</p>
      </OtherLang>
    </StoreShell>
  );
}
