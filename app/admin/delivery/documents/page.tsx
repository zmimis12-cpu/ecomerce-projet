import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { FetchDocumentForm } from "@/components/delivery-integration/fetch-document-form";
import { FileDown } from "lucide-react";

export const metadata: Metadata = { title: "Bons & Documents" };
export const dynamic = "force-dynamic";

const DOC_LABELS: Record<string, string> = {
  bon_livraison: "Bon de Livraison",
  bon_ramassage: "Bon de Ramassage",
  bon_retour:    "Bon de Retour",
};

export default async function DocumentsPage() {
  await requireRole(["super_admin","admin","manager"]);
  const supabase = await createClient();

  const { data: docs } = await supabase
    .from("delivery_documents")
    .select("id,document_type,document_date,file_url,external_id,created_at")
    .order("document_date", { ascending: false })
    .limit(50);

  type Doc = { id: string; document_type: string; document_date: string; file_url: string | null; external_id: string | null; created_at: string };
  const rows = (docs ?? []) as Doc[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Bons & Documents</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Téléchargez les bons de livraison, ramassage et retour.
        </p>
      </div>

      <FetchDocumentForm />

      {rows.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b font-medium text-sm">Documents récents</div>
          <div className="divide-y">
            {rows.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{DOC_LABELS[doc.document_type] ?? doc.document_type}</p>
                  <p className="text-xs text-muted-foreground">{doc.document_date}</p>
                </div>
                {doc.file_url ? (
                  <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                    <FileDown className="h-3.5 w-3.5" /> Télécharger
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">Non disponible</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
