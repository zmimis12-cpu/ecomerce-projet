import type { Metadata } from "next";
import { StoreShell, InfoCard, OtherLang } from "@/components/store/store-shell";

export const metadata: Metadata = { title: "حذف المعطيات — HajtekZone", robots: { index: true } };

export default function DataDeletionPage() {
  return (
    <StoreShell current="/suppression-donnees" title="حذف المعطيات" subtitle="تقدر تطلب حذف المعطيات ديالك فأي وقت، بسهولة.">
      <InfoCard icon="🗑️" title="كيفاش تطلب الحذف؟">
        <ol className="list-inside list-decimal space-y-1">
          <li>صيفط لينا رسالة فالواتساب ولا إيميل لـ <a className="text-[#F3D98B] underline" href="mailto:contact@hajtek.ma">contact@hajtek.ma</a> بعنوان «حذف المعطيات».</li>
          <li>عطينا رقم الهاتف اللي درتي بيه الطلب.</li>
          <li>كنحذفو المعطيات ديالك فـ 30 يوم على الأكثر، وكنأكدو ليك.</li>
        </ol>
      </InfoCard>
      <InfoCard icon="🔐" title="ملاحظة">
        <p>المعطيات اللي تصيفطات لـ Meta ولا TikTok كانت غير مشفرة (hachée)، وما كتسمحش باش يتعرفو عليك مباشرة.</p>
      </InfoCard>
      <OtherLang label="Suppression des données (Français) / Data deletion (English)">
        <h3>Français</h3>
        <p>Envoyez un message WhatsApp ou un email à contact@hajtek.ma avec l&apos;objet « Suppression de données », en indiquant le numéro de téléphone utilisé lors de la commande. Vos données sont supprimées sous 30 jours maximum et nous vous le confirmons.</p>
        <h3>English</h3>
        <p>To delete your personal data, send a WhatsApp message or an email to contact@hajtek.ma with the subject &quot;Data deletion&quot; and the phone number used for your order. Your data is deleted within 30 days and we confirm it to you.</p>
      </OtherLang>
    </StoreShell>
  );
}
