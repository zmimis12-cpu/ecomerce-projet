import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { getAllSettingsFlat } from "@/lib/settings/settings-service";
import { SettingsClient } from "@/components/settings/settings-client";

export const metadata: Metadata = { title: "Paramètres" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireRole(["super_admin", "admin"]);
  const settings = await getAllSettingsFlat();
  return <SettingsClient settings={settings} />;
}
