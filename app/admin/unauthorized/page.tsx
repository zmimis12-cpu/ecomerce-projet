import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { logout } from "@/app/admin/actions";

export const metadata: Metadata = { title: "Accès refusé" };

const MSG: Record<string, string> = {
  inactive: "Ce compte est désactivé. Contacte l'administrateur.",
  "no-profile": "Ce compte n'a pas encore de profil dans GestionPro. Demande à l'administrateur de te créer un accès (Paramètres → Utilisateurs).",
};

export default async function UnauthorizedPage({
  searchParams,
}: { searchParams: Promise<Record<string, string>> }) {
  const { reason } = await searchParams;
  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl border bg-card p-6 text-center">
      <ShieldAlert className="mx-auto h-10 w-10 text-amber-500" />
      <h1 className="mt-3 text-lg font-semibold">Accès refusé</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {MSG[reason ?? ""] ?? "Ton rôle ne permet pas d'ouvrir cette page."}
      </p>
      <form action={logout} className="mt-5">
        <button className="rounded-md border px-4 py-2 text-sm hover:bg-muted">Se déconnecter</button>
      </form>
    </div>
  );
}
