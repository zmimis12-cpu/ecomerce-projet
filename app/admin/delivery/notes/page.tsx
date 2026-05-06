import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { DeliveryNotesClient } from "@/components/delivery-batch/delivery-notes-client";

export const metadata: Metadata = { title: "Delivery Notes" };
export const dynamic = "force-dynamic";

type Batch = {
  id: string;
  batch_number: string;
  bl_id: number | null;
  status: string;
  payment_status: string | null;
  shipping_company: string | null;
  store_name: string | null;
  total_orders: number;
  total_products: number;
  sent_at: string | null;
  created_at: string;
  notes: string | null;
};

export default async function DeliveryNotesPage() {
  await requireRole(["super_admin", "admin", "manager"]);

  const { data: batches } = await supabaseAdmin
    .from("delivery_batches")
    .select(
      "id,batch_number,bl_id,status,payment_status,shipping_company,store_name,total_orders,total_products,sent_at,created_at,notes"
    )
    .order("created_at", { ascending: false })
    .limit(500);

  const rows = (batches ?? []) as Batch[];

  // Extract unique filter values
  const stores    = [...new Set(rows.map((r) => r.store_name).filter(Boolean))] as string[];
  const companies = [...new Set(rows.map((r) => r.shipping_company ?? "Digylog").filter(Boolean))] as string[];

  return (
    <div className="h-full flex flex-col">
      <DeliveryNotesClient rows={rows} stores={stores} companies={companies} />
    </div>
  );
}
