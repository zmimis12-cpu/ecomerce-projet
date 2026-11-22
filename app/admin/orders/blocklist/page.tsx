import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { loadBlocklist, BLOCK_IP_DAYS } from "@/lib/orders/blocklist";
import { UnblockButton } from "./unblock-button";

export const metadata: Metadata = { title: "Liste noire" };
export const dynamic = "force-dynamic";

export default async function BlocklistPage() {
  await requireRole(["super_admin", "admin", "manager"]);
  const entries = await loadBlocklist();
  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-bold">🚫 Liste noire clients</h1>
        <p className="text-sm text-muted-foreground">
          Commandes refusées en silence (le client voit « commande reçue ») : rien n&apos;est enregistré et aucun pixel n&apos;est envoyé.
          Numéro bloqué pour toujours, IP pendant {BLOCK_IP_DAYS} jours. Pour bloquer : bouton « Bloquer ce client » sur une commande.
        </p>
      </div>
      <div className="rounded-xl border bg-card divide-y">
        {entries.length === 0 && <p className="p-4 text-sm text-muted-foreground">Aucun client bloqué.</p>}
        {entries.map((e) => (
          <div key={e.phone} className="flex items-center justify-between gap-3 p-3 text-sm">
            <div>
              <div className="font-mono font-medium">{e.phone}</div>
              <div className="text-xs text-muted-foreground">
                {e.name ?? "—"} · {e.orderNumber ?? ""} · {new Date(e.at).toLocaleDateString("fr-MA")}
              </div>
            </div>
            <UnblockButton phone={e.phone} />
          </div>
        ))}
      </div>
      <Link href="/admin/orders" className="text-sm text-primary hover:underline">← Commandes</Link>
    </div>
  );
}
