import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { getConfirmedOrdersForBatch } from "@/lib/delivery/batch/actions";
import { BatchCreator } from "@/components/delivery-batch/batch-creator";

export const metadata: Metadata = { title: "Nouveau groupe livraison" };
export const dynamic = "force-dynamic";

export default async function NewBatchPage() {
  await requireRole(["super_admin","admin","manager"]);
  const orders = await getConfirmedOrdersForBatch();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Nouveau groupe livraison</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Sélectionnez les commandes confirmées à grouper et envoyer à Digylog.
        </p>
      </div>
      <BatchCreator orders={orders} />
    </div>
  );
}
