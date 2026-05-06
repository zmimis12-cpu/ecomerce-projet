import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { DocumentsClient } from "@/components/delivery-integration/documents-client";

export const metadata: Metadata = { title: "Documents BL" };
export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  await requireRole(["super_admin","admin","manager"]);

  // Load all batches that have a bl_id — these are the "documents"
  const { data: batches } = await supabaseAdmin
    .from("delivery_batches")
    .select("id,batch_number,bl_id,store_name,total_orders,status,payment_status,sent_at,created_at,labels_downloaded_at")
    .not("bl_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);

  type BLDoc = {
    id: string; batch_number: string; bl_id: number;
    store_name: string | null; total_orders: number;
    status: string; payment_status: string | null;
    sent_at: string | null; created_at: string;
    labels_downloaded_at: string | null;
  };

  const docs = (batches ?? []) as BLDoc[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Documents — Bons de Livraison</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tous vos BL Digylog. Téléchargez le PDF de chaque bon de livraison.
        </p>
      </div>
      <DocumentsClient docs={docs} />
    </div>
  );
}
