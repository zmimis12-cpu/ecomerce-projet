import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { getAllSettingsFlat } from "@/lib/settings/settings-service";
import { getUsers } from "@/lib/settings/users-actions";
import { SettingsClient } from "@/components/settings/settings-client";

export const metadata: Metadata = { title: "Paramètres" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireRole(["super_admin", "admin"]);

  const [settings, users] = await Promise.all([
    getAllSettingsFlat(),
    session.role === "super_admin" || session.role === "admin"
      ? getUsers()
      : Promise.resolve([]),
  ]);

  return <SettingsClient settings={settings} users={users} />;
}
