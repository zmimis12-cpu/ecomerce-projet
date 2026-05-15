import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Building2, Plus, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Sociétés de Livraison" };
export const dynamic = "force-dynamic";

export default async function DeliveryProvidersPage() {
  await requireRole(["super_admin", "admin"]);

  const { data: companies } = await supabaseAdmin
    .from("delivery_companies")
    .select("id, slug, name, is_active")
    .order("name");

  const { data: stores } = await supabaseAdmin
    .from("delivery_stores")
    .select("id, name, slug, is_default, is_active, delivery_fee_mad, company_id, google_sheet_id")
    .order("name");

  type Company = { id: string; slug: string; name: string; is_active: boolean };
  type Store   = { id: string; name: string; slug: string; is_default: boolean; is_active: boolean; delivery_fee_mad: number; company_id: string; google_sheet_id: string | null };

  const cos = (companies ?? []) as Company[];
  const sts = (stores ?? []) as Store[];

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Sociétés de Livraison</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gérez vos transporteurs et leurs comptes/stores.
        </p>
      </div>

      {/* Companies */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <p className="font-semibold text-sm">Sociétés</p>
          </div>
        </div>
        <div className="divide-y">
          {cos.length === 0 && (
            <p className="px-5 py-8 text-sm text-muted-foreground text-center">
              Aucune société. Exécutez la migration SQL.
            </p>
          )}
          {cos.map((c) => {
            const cStores = sts.filter((s) => s.company_id === c.id);
            return (
              <div key={c.id} className="px-5 py-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full", c.is_active ? "bg-green-500" : "bg-gray-300")} />
                    <p className="font-medium">{c.name}</p>
                    <span className="text-xs text-muted-foreground font-mono">({c.slug})</span>
                  </div>
                </div>
                {/* Stores */}
                <div className="pl-4 space-y-2">
                  {cStores.map((s) => (
                    <div key={s.id} className="rounded-lg border bg-secondary/20 px-4 py-2.5 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium flex items-center gap-1.5">
                          {s.name}
                          {s.is_default && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-semibold">
                              <CheckCircle2 className="h-2.5 w-2.5" /> Défaut
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Frais: {s.delivery_fee_mad} MAD
                          {s.google_sheet_id && ` · Sheet: ${s.google_sheet_id.slice(0, 12)}…`}
                        </p>
                      </div>
                      <span className={cn("text-xs font-medium rounded-full px-2 py-0.5",
                        s.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                      )}>
                        {s.is_active ? "Actif" : "Inactif"}
                      </span>
                    </div>
                  ))}
                  {cStores.length === 0 && (
                    <p className="text-xs text-muted-foreground px-2">Aucun store configuré.</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Info box */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/30 px-5 py-4">
        <p className="text-sm font-semibold text-blue-800 mb-1">Configuration avancée</p>
        <p className="text-xs text-blue-700">
          Pour ajouter un provider ou modifier les tokens API, utilisez le SQL Editor Supabase
          sur la table <code className="font-mono bg-blue-100 px-1 rounded">delivery_stores</code>.
          Les tokens sont stockés en base de données (pas dans Vercel env).
        </p>
        <div className="mt-3 text-xs text-blue-700 space-y-1">
          <p>• <strong>Digylog</strong> → slug: <code className="font-mono bg-blue-100 px-1 rounded">digylog</code></p>
          <p>• <strong>Ozone Express</strong> → à ajouter via SQL</p>
        </div>
      </div>

      <div className="rounded-xl border bg-card px-5 py-4">
        <p className="text-sm font-semibold mb-3">SQL pour ajouter un nouveau provider</p>
        <pre className="text-xs bg-secondary/50 rounded-lg p-4 overflow-x-auto">{`-- Ajouter Ozone Express
INSERT INTO delivery_companies (slug, name)
VALUES ('ozone', 'Ozone Express');

-- Ajouter un store
INSERT INTO delivery_stores 
  (company_id, name, slug, api_token, delivery_fee_mad)
SELECT id, 'Mon compte Ozone', 'compte1', 'TOKEN_ICI', 25
FROM delivery_companies WHERE slug = 'ozone';`}</pre>
      </div>
    </div>
  );
}
