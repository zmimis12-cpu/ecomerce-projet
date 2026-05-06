import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { DeliveryNotesClient } from "@/components/delivery-batch/delivery-notes-client";

export const metadata: Metadata = { title: "Delivery Notes" };
export const dynamic = "force-dynamic";

type Batch = {
  id: string;
  batch_number: string;
  status: string;
  shipping_company: string | null;
  store_name: string | null;
  total_orders: number;
  created_at: string;
  labels_downloaded_at: string | null;
};

export default async function DeliveryNotesPage() {
  await requireRole(["super_admin", "admin", "manager"]);

  const { data: batches } = await supabaseAdmin
    .from("delivery_batches")
    .select("id,batch_number,status,shipping_company,store_name,total_orders,created_at,labels_downloaded_at")
    .not("status", "eq", "cancelled")
    .order("created_at", { ascending: false })
    .limit(500);

  const rows = (batches ?? []) as Batch[];

  const stores    = [...new Set(rows.map((r) => r.store_name).filter(Boolean))] as string[];
  const companies = [...new Set(rows.map((r) => r.shipping_company ?? "Digylog"))] as string[];

  return (
    <div className="space-y-5">
      <DeliveryNotesClient rows={rows} stores={stores} companies={companies} />
    </div>
  );
}
