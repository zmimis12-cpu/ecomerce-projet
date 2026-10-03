import type { Metadata } from "next";

export const metadata: Metadata = { title: "Suppression des données — HajtekZone" };

export default function DataDeletionPage() {
  return (
    <main style={{ maxWidth: 760, margin: "40px auto", padding: "0 20px", fontFamily: "system-ui,sans-serif", lineHeight: 1.7, color: "#111827" }}>
      <h1>Suppression de vos données</h1>
      <p>Pour demander la suppression de vos données personnelles (commandes, téléphone, adresse) chez <b>HajtekZone</b> :</p>
      <ol>
        <li>Envoyez un message WhatsApp ou un email à notre service client avec l&apos;objet « Suppression de données ».</li>
        <li>Indiquez le numéro de téléphone utilisé lors de la commande.</li>
        <li>Vos données sont supprimées sous 30 jours maximum, et nous vous le confirmons.</li>
      </ol>
      <p>Les données déjà transmises à Meta ou TikTok l&apos;ont été uniquement sous forme chiffrée (hachée) et ne permettent pas
        de vous identifier directement.</p>
      <hr />
      <p dir="rtl">باش تطلب حذف المعطيات ديالك، صيفط لينا رسالة فالواتساب ب «حذف المعطيات» مع رقم الهاتف ديال الطلبية.</p>
    </main>
  );
}
