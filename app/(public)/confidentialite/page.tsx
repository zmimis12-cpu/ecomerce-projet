import type { Metadata } from "next";

export const metadata: Metadata = { title: "Politique de confidentialité — HajtekZone", robots: { index: true } };

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 760, margin: "40px auto", padding: "0 20px", fontFamily: "system-ui,sans-serif", lineHeight: 1.7, color: "#111827" }}>
      <h1>Politique de confidentialité</h1>
      <p><b>HajtekZone</b> (hajtek.ma) — dernière mise à jour : octobre 2026.</p>

      <h2>1. Données collectées</h2>
      <p>Lorsque vous passez commande sur nos pages, nous collectons : nom, numéro de téléphone, ville, adresse de livraison et
        le produit commandé. Nous utilisons aussi des cookies et le pixel Meta (Facebook / Instagram) et TikTok pour mesurer
        l&apos;efficacité de nos publicités.</p>

      <h2>2. Utilisation</h2>
      <p>Vos données servent uniquement à : confirmer votre commande (appel ou WhatsApp), la livrer via notre société de livraison,
        assurer le service client, et améliorer nos publicités. Nous ne vendons jamais vos données.</p>

      <h2>3. Partage</h2>
      <p>Vos données sont partagées uniquement avec : notre société de livraison (pour livrer la commande) et Meta / TikTok
        sous forme chiffrée (hachée) pour la mesure publicitaire.</p>

      <h2>4. Conservation</h2>
      <p>Les données de commande sont conservées le temps nécessaire au suivi de la commande et aux obligations légales.</p>

      <h2>5. Vos droits</h2>
      <p>Conformément à la loi marocaine 09-08, vous pouvez demander l&apos;accès, la rectification ou la suppression de vos données :
        voir <a href="/suppression-donnees">Suppression des données</a>.</p>

      <hr />
      <h2 dir="rtl">سياسة الخصوصية</h2>
      <p dir="rtl">كنجمعو الاسم، رقم الهاتف، المدينة والعنوان غير باش نأكدو ونوصلو الطلبية ديالك. ما كنبيعوش المعطيات ديالك لحد.
        تقدر تطلب حذف المعطيات ديالك فأي وقت.</p>
    </main>
  );
}
