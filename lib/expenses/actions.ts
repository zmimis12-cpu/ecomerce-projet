"use server";
/**
 * lib/expenses/actions.ts
 * Gestion des cartes bancaires et des dépenses (domaine, abonnements, etc.)
 * — feature séparée du dashboard commandes.
 */
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";

const MANAGER = ["super_admin", "admin", "manager", "finance"] as const;

export type ExpenseCategory =
  | "shipping" | "packaging" | "advertising" | "salaries" | "rent"
  | "utilities" | "software" | "returns_cost" | "customs" | "other";

export interface BankCard {
  id: string;
  label: string;
  last4: string | null;
  color: string;
  is_active: boolean;
  created_at: string;
}

export interface Expense {
  id: string;
  category: ExpenseCategory;
  description: string;
  amount_mad: number;
  expense_date: string;
  card_id: string | null;
  reference: string | null;
  notes: string | null;
  created_at: string;
}

// ── Cards ─────────────────────────────────────────────────────────────────────
export async function listBankCards(): Promise<BankCard[]> {
  await requireRole([...MANAGER]);
  const { data } = await supabaseAdmin
    .from("bank_cards")
    .select("id, label, last4, color, is_active, created_at")
    .order("created_at");
  return (data ?? []) as BankCard[];
}

export async function addBankCard(data: { label: string; last4?: string; color?: string }): Promise<{ success: boolean; error?: string }> {
  await requireRole([...MANAGER]);
  if (!data.label.trim()) return { success: false, error: "Nom de carte requis." };

  const { error } = await supabaseAdmin.from("bank_cards").insert({
    label: data.label.trim(),
    last4: data.last4?.trim() || null,
    color: data.color || "#0f172a",
  } as never);

  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/expenses");
  return { success: true };
}

export async function toggleBankCard(id: string, isActive: boolean): Promise<{ success: boolean; error?: string }> {
  await requireRole([...MANAGER]);
  const { error } = await supabaseAdmin.from("bank_cards").update({ is_active: isActive } as never).eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/expenses");
  return { success: true };
}

export async function deleteBankCard(id: string): Promise<{ success: boolean; error?: string }> {
  await requireRole([...MANAGER]);
  const { error } = await supabaseAdmin.from("bank_cards").delete().eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/expenses");
  return { success: true };
}

// ── Expenses ──────────────────────────────────────────────────────────────────
export async function addExpense(data: {
  category: ExpenseCategory;
  description: string;
  amount_mad: number;
  expense_date: string;
  card_id?: string;
  reference?: string;
  notes?: string;
}): Promise<{ success: boolean; error?: string }> {
  const session = await requireRole([...MANAGER]);

  if (!data.description.trim()) return { success: false, error: "Description requise." };
  if (!data.amount_mad || data.amount_mad <= 0) return { success: false, error: "Montant invalide." };
  if (!data.expense_date) return { success: false, error: "Date requise." };

  const { error } = await supabaseAdmin.from("expenses").insert({
    category:     data.category,
    description:  data.description.trim(),
    amount_mad:   data.amount_mad,
    expense_date: data.expense_date,
    card_id:      data.card_id || null,
    reference:    data.reference?.trim() || null,
    notes:        data.notes?.trim() || null,
    paid_by:      session.authId,
    created_by:   session.authId,
  } as never);

  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/expenses");
  return { success: true };
}

export async function deleteExpense(id: string): Promise<{ success: boolean; error?: string }> {
  await requireRole([...MANAGER]);
  const { error } = await supabaseAdmin.from("expenses").delete().eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/expenses");
  return { success: true };
}

export interface CardWithExpenses extends BankCard {
  expenses: Expense[];
  total_mad: number;
}

/** Toutes les cartes avec leurs dépenses (période optionnelle) + les dépenses sans carte */
export async function getExpensesByCard(filter?: { from?: string; to?: string }): Promise<{
  cards: CardWithExpenses[];
  unassigned: { expenses: Expense[]; total_mad: number };
  grand_total: number;
}> {
  await requireRole([...MANAGER]);

  const [{ data: cardsData }, expensesRes] = await Promise.all([
    supabaseAdmin.from("bank_cards").select("id, label, last4, color, is_active, created_at").order("created_at"),
    (async () => {
      let q = supabaseAdmin
        .from("expenses")
        .select("id, category, description, amount_mad, expense_date, card_id, reference, notes, created_at")
        .order("expense_date", { ascending: false });
      if (filter?.from) q = q.gte("expense_date", filter.from);
      if (filter?.to)   q = q.lte("expense_date", filter.to);
      return q.limit(500);
    })(),
  ]);

  const cardsList = (cardsData ?? []) as BankCard[];
  const allExpenses = (expensesRes.data ?? []) as Expense[];

  const cards: CardWithExpenses[] = cardsList.map((c) => {
    const expenses = allExpenses.filter((e) => e.card_id === c.id);
    return { ...c, expenses, total_mad: expenses.reduce((s, e) => s + e.amount_mad, 0) };
  });

  const unassignedExpenses = allExpenses.filter((e) => !e.card_id);
  const unassigned = { expenses: unassignedExpenses, total_mad: unassignedExpenses.reduce((s, e) => s + e.amount_mad, 0) };

  const grand_total = allExpenses.reduce((s, e) => s + e.amount_mad, 0);

  return { cards, unassigned, grand_total };
}
