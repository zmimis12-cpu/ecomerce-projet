import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { getExpensesByCard } from "@/lib/expenses/actions";
import { ExpensesManager } from "@/components/expenses/expenses-manager";

export const metadata: Metadata = { title: "Dépenses & Cartes" };
export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  await requireRole(["super_admin", "admin", "manager", "finance"]);

  const { cards, unassigned, grand_total } = await getExpensesByCard();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dépenses & Cartes</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Domaine, abonnements, charges diverses — séparé des commandes. Suivi par carte bancaire.
        </p>
      </div>

      <ExpensesManager cards={cards} unassigned={unassigned} grandTotal={grand_total} />
    </div>
  );
}
