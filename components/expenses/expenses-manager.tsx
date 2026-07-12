"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, CreditCard, ChevronDown, ChevronRight } from "lucide-react";
import { addBankCard, deleteBankCard, addExpense, deleteExpense, type CardWithExpenses, type Expense, type ExpenseCategory } from "@/lib/expenses/actions";

function mad(n: number) {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " MAD";
}

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  shipping: "Livraison", packaging: "Emballage", advertising: "Publicité",
  salaries: "Salaires", rent: "Loyer", utilities: "Charges", software: "Logiciel/Abonnement",
  returns_cost: "Coût retours", customs: "Douane", other: "Autre",
};

const CARD_COLORS = ["#0f172a", "#1d4ed8", "#059669", "#d97706", "#dc2626", "#7c3aed", "#0891b2"];

export function ExpensesManager({
  cards, unassigned, grandTotal,
}: {
  cards: CardWithExpenses[];
  unassigned: { expenses: Expense[]; total_mad: number };
  grandTotal: number;
}) {
  const [showAddCard, setShowAddCard] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState<string | "unassigned" | null>(null);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Add card form state
  const [cardLabel, setCardLabel] = useState("");
  const [cardLast4, setCardLast4] = useState("");
  const [cardColor, setCardColor] = useState(CARD_COLORS[0]);

  const [cardError, setCardError] = useState<string | null>(null);

  function submitCard() {
    if (!cardLabel.trim()) return;
    setCardError(null);
    startTransition(async () => {
      const res = await addBankCard({ label: cardLabel, last4: cardLast4 || undefined, color: cardColor });
      if (!res.success) { setCardError(res.error ?? "Erreur inconnue."); return; }
      setCardLabel(""); setCardLast4(""); setShowAddCard(false);
      router.refresh();
    });
  }

  function removeCard(id: string) {
    startTransition(async () => { await deleteBankCard(id); router.refresh(); });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="rounded-xl border bg-card px-5 py-4">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total toutes dépenses</div>
          <div className="text-2xl font-bold mt-1">{mad(grandTotal)}</div>
        </div>
        <button type="button" onClick={() => setShowAddCard(true)}
          className="flex items-center gap-1.5 rounded-lg bg-black text-white px-3 py-2 text-sm font-medium">
          <Plus className="h-4 w-4" /> Nouvelle carte
        </button>
      </div>

      {showAddCard && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Nom de la carte</label>
              <input value={cardLabel} onChange={(e) => setCardLabel(e.target.value)} placeholder="ex: Visa Business"
                className="flex h-9 rounded-md border border-input bg-background px-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">4 derniers chiffres</label>
              <input value={cardLast4} onChange={(e) => setCardLast4(e.target.value)} placeholder="1234" maxLength={4}
                className="flex h-9 w-20 rounded-md border border-input bg-background px-2 text-sm" />
            </div>
            <div className="flex items-center gap-1.5">
              {CARD_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setCardColor(c)}
                  className="h-7 w-7 rounded-full border-2"
                  style={{ backgroundColor: c, borderColor: cardColor === c ? "#000" : "transparent" }} />
              ))}
            </div>
            <button type="button" onClick={submitCard} disabled={isPending || !cardLabel.trim()}
              className="h-9 rounded-md bg-black text-white px-3 text-sm font-medium disabled:opacity-50">
              Créer
            </button>
            <button type="button" onClick={() => setShowAddCard(false)}
              className="h-9 rounded-md px-3 text-sm font-medium hover:bg-secondary/80">
              Annuler
            </button>
          </div>
          {cardError && <p className="text-xs text-red-600 bg-red-50 rounded-md px-3 py-2">{cardError}</p>}
        </div>
      )}

      {cards.map((card) => (
        <div key={card.id} className="rounded-xl border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 cursor-pointer"
            onClick={() => setExpandedCard(expandedCard === card.id ? null : card.id)}>
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: card.color }}>
                <CreditCard className="h-4 w-4 text-white" />
              </div>
              <div>
                <div className="font-semibold text-sm">{card.label}{card.last4 && <span className="text-muted-foreground font-normal"> •••• {card.last4}</span>}</div>
                <div className="text-xs text-muted-foreground">{card.expenses.length} dépense(s)</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-bold">{mad(card.total_mad)}</span>
              <button type="button" onClick={(e) => { e.stopPropagation(); setShowAddExpense(card.id); }}
                className="text-xs rounded-md bg-secondary px-2 py-1 hover:bg-secondary/80">+ Dépense</button>
              <button type="button" onClick={(e) => { e.stopPropagation(); removeCard(card.id); }} disabled={isPending}
                className="text-red-500 hover:text-red-700"><Trash2 className="h-3.5 w-3.5" /></button>
              {expandedCard === card.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </div>
          </div>

          {showAddExpense === card.id && (
            <ExpenseForm cardId={card.id} onDone={() => { setShowAddExpense(null); router.refresh(); }} />
          )}

          {expandedCard === card.id && card.expenses.length > 0 && (
            <div className="border-t divide-y">
              {card.expenses.map((e) => (
                <ExpenseRow key={e.id} expense={e} onDeleted={() => router.refresh()} />
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Unassigned */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 cursor-pointer"
          onClick={() => setExpandedCard(expandedCard === "unassigned" ? null : "unassigned")}>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-gray-300 flex items-center justify-center">
              <CreditCard className="h-4 w-4 text-white" />
            </div>
            <div>
              <div className="font-semibold text-sm">Sans carte assignée</div>
              <div className="text-xs text-muted-foreground">{unassigned.expenses.length} dépense(s)</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-bold">{mad(unassigned.total_mad)}</span>
            <button type="button" onClick={(e) => { e.stopPropagation(); setShowAddExpense("unassigned"); }}
              className="text-xs rounded-md bg-secondary px-2 py-1 hover:bg-secondary/80">+ Dépense</button>
            {expandedCard === "unassigned" ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </div>
        </div>
        {showAddExpense === "unassigned" && (
          <ExpenseForm cardId={null} onDone={() => { setShowAddExpense(null); router.refresh(); }} />
        )}
        {expandedCard === "unassigned" && unassigned.expenses.length > 0 && (
          <div className="border-t divide-y">
            {unassigned.expenses.map((e) => (
              <ExpenseRow key={e.id} expense={e} onDeleted={() => router.refresh()} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ExpenseForm({ cardId, onDone }: { cardId: string | null; onDone: () => void }) {
  const [category, setCategory] = useState<ExpenseCategory>("software");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await addExpense({
        category, description, amount_mad: parseFloat(amount) || 0, expense_date: date,
        card_id: cardId ?? undefined,
      });
      if (!res.success) { setError(res.error ?? "Erreur."); return; }
      setDescription(""); setAmount("");
      onDone();
    });
  }

  return (
    <div className="border-t bg-secondary/30 px-5 py-3 flex flex-wrap items-end gap-2">
      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Catégorie</label>
        <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
          className="flex h-9 rounded-md border border-input bg-background px-2 text-sm">
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="flex-1 min-w-[160px]">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</label>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="ex: Domaine hajtek.ma"
          className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm" />
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Montant (MAD)</label>
        <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0"
          className="flex h-9 w-24 rounded-md border border-input bg-background px-2 text-sm" />
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="flex h-9 rounded-md border border-input bg-background px-2 text-sm" />
      </div>
      <button type="button" onClick={submit} disabled={isPending || !description.trim() || !amount}
        className="h-9 rounded-md bg-black text-white px-3 text-sm font-medium disabled:opacity-50">
        Ajouter
      </button>
      {error && <p className="text-xs text-red-600 w-full">{error}</p>}
    </div>
  );
}

function ExpenseRow({ expense, onDeleted }: { expense: Expense; onDeleted: () => void }) {
  const [isPending, startTransition] = useTransition();
  function remove() {
    startTransition(async () => { await deleteExpense(expense.id); onDeleted(); });
  }
  return (
    <div className="flex items-center justify-between px-5 py-2.5 text-sm">
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium bg-gray-100 rounded px-2 py-0.5">{CATEGORY_LABELS[expense.category]}</span>
        <span>{expense.description}</span>
        <span className="text-muted-foreground text-xs">{expense.expense_date}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-semibold">{mad(expense.amount_mad)}</span>
        <button type="button" onClick={remove} disabled={isPending} className="text-red-500 hover:text-red-700 disabled:opacity-50">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
