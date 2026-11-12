"use client";
import { Printer, MessageCircle } from "lucide-react";

export function ReceiptActions({ waText }: { waText: string }) {
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <button type="button" onClick={() => window.print()}
        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 text-white px-4 py-2 text-sm font-semibold hover:bg-emerald-700">
        <Printer className="h-4 w-4" /> Imprimer / PDF
      </button>
      <button type="button" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(waText + "\n" + window.location.href)}`, "_blank")}
        className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-secondary">
        <MessageCircle className="h-4 w-4" /> Envoyer sur WhatsApp
      </button>
    </div>
  );
}
