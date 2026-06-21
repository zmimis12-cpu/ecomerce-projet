import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { getDailyBls } from "@/lib/delivery/daily-bl-actions";
import { DailyBlClient } from "@/components/delivery-integration/daily-bl-client";

export const metadata: Metadata = { title: "BL du Jour" };
export const dynamic = "force-dynamic";

export default async function DailyBlPage() {
  await requireRole(["super_admin", "admin", "manager"]);

  const rows = await getDailyBls();
  const defaultStoreName = rows.find((r) => r.store_name)?.store_name || "Hajtekzone";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">BL du Jour</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Un Bon de Livraison regroupant tous les trackings envoyés à Digylog pour chaque journée.
        </p>
      </div>
      <DailyBlClient rows={rows} defaultStoreName={defaultStoreName} />
    </div>
  );
}
