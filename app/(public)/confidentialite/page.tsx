import type { Metadata } from "next";
import Link from "next/link";
import { StoreShell, InfoCard, OtherLang } from "@/components/store/store-shell";

export const metadata: Metadata = { title: "سياسة الخصوصية — HajtekZone", robots: { index: true } };

export default function PrivacyPage() {
  return (
    <StoreShell current="/confidentialite" title="سياسة الخصوصية" subtitle="المعطيات ديالك محمية. آخر تحديث: أكتوبر 2026.">
      <InfoCard icon="📋" title="1. شنو كنجمعو؟">
        <p>ملي كتدير طلب: الاسم، رقم الهاتف، المدينة، العنوان، والمنتج اللي طلبتي. كنستعملو حتى cookies وبيكسل Meta (فيسبوك / إنستغرام) وTikTok باش نقيسو نتائج الإعلانات ديالنا.</p>
      </InfoCard>
      <InfoCard icon="🎯" title="2. علاش كنستعملوها؟">
        <p>غير باش: نأكدو الطلب معاك (مكالمة ولا واتساب)، نوصلوه ليك مع شركة التوصيل، نخدموك فخدمة الزبناء، ونحسنو الإعلانات ديالنا. <b className="text-white">ما كنبيعوش المعطيات ديالك لحد.</b></p>
      </InfoCard>
      <InfoCard icon="🤝" title="3. مع من كنشاركوها؟">
        <p>غير مع شركة التوصيل (باش توصلك الطلبية)، ومع Meta وTikTok بطريقة مشفرة (hachée) ما كتبينش شكون نتا.</p>
      </InfoCard>
      <InfoCard icon="🗄️" title="4. مدة الحفظ">
        <p>كنحتافظو بمعطيات الطلب غير المدة اللازمة لتتبع الطلب وللالتزامات القانونية.</p>
      </InfoCard>
      <InfoCard icon="⚖️" title="5. الحقوق ديالك">
        <p>طبقاً للقانون المغربي 09-08، تقدر تطلب الاطلاع، التصحيح، ولا الحذف ديال المعطيات ديالك: شوف صفحة <Link className="text-[#F3D98B] underline" href="/suppression-donnees">حذف المعطيات</Link>.</p>
      </InfoCard>
      <OtherLang label="Politique de confidentialité (Français)">
        <h3>1. Données collectées</h3><p>Lors d&apos;une commande : nom, téléphone, ville, adresse de livraison et produit commandé. Nous utilisons aussi des cookies et les pixels Meta (Facebook / Instagram) et TikTok pour mesurer nos publicités.</p>
        <h3>2. Utilisation</h3><p>Confirmer votre commande (appel ou WhatsApp), la livrer via notre société de livraison, assurer le service client et améliorer nos publicités. Nous ne vendons jamais vos données.</p>
        <h3>3. Partage</h3><p>Uniquement avec notre société de livraison, et avec Meta / TikTok sous forme chiffrée (hachée) pour la mesure publicitaire.</p>
        <h3>4. Conservation</h3><p>Le temps nécessaire au suivi de la commande et aux obligations légales.</p>
        <h3>5. Vos droits</h3><p>Conformément à la loi marocaine 09-08 : accès, rectification ou suppression — voir « Suppression des données ».</p>
      </OtherLang>
    </StoreShell>
  );
}
