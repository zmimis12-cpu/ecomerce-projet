import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { getWhatsAppSettings } from "@/lib/whatsapp/actions";
import { WhatsAppSettingsForm } from "@/components/whatsapp/whatsapp-settings-form";

export const metadata: Metadata = { title: "Réglages WhatsApp" };
export const dynamic = "force-dynamic";

export default async function WhatsAppSettingsPage() {
  await requireRole(["super_admin", "admin", "manager"]);
  const settings = await getWhatsAppSettings();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Confirmation WhatsApp</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Message automatique en Darija envoyé au client à chaque nouvelle commande, via Meta WhatsApp Cloud API (pas d&apos;abonnement mensuel).
        </p>
      </div>

      <WhatsAppSettingsForm initial={settings ? {
        access_token: settings.access_token,
        phone_number_id: settings.phone_number_id,
        is_active: settings.is_active,
        message_template: settings.message_template,
      } : null} />
    </div>
  );
}
