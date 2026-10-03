"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runAdRules } from "./rules-engine";
import type { RuleCondition, RuleWindow, RuleAction, RuleLevel } from "./rules-types";

const MANAGERS = ["super_admin", "admin", "manager"] as const;
type Result = { success: boolean; error?: string; info?: string };

export async function saveAdRule(input: {
  id?: string; name: string; level: RuleLevel; productId: string | null; window: RuleWindow;
  conditions: RuleCondition[]; action: RuleAction; simulate: boolean; cooldown: number;
  budgetPct?: number | null; budgetMaxUsd?: number | null; budgetMinUsd?: number | null;
  accountKey?: string | null;
}): Promise<Result> {
  const session = await requireRole([...MANAGERS]);
  if (!input.name.trim()) return { success: false, error: "Donne un nom à la règle." };
  const conds = input.conditions.filter((c) => c.metric && c.op && Number.isFinite(c.value));
  if (!conds.length) return { success: false, error: "Ajoute au moins une condition." };
  const isBudget = input.action === "increase_budget" || input.action === "decrease_budget";
  if (isBudget && !(Number(input.budgetPct) > 0)) return { success: false, error: "Indique le pourcentage de changement de budget." };
  if (input.action === "increase_budget" && !(Number(input.budgetMaxUsd) > 0)) return { success: false, error: "Indique un budget maximum (sécurité)." };
  const row = {
    name: input.name.trim(), level: input.level, product_id: input.productId || null,
    time_window: input.window, conditions: conds, action: input.action,
    simulate: input.simulate, cooldown_minutes: Math.max(15, input.cooldown || 60),
    budget_pct: isBudget ? Number(input.budgetPct) : null,
    budget_max_usd: input.action === "increase_budget" ? Number(input.budgetMaxUsd) : null,
    budget_min_usd: input.action === "decrease_budget" ? (Number(input.budgetMinUsd) || null) : null,
    account_key: input.accountKey || null,
  };
  const q = input.id
    ? supabaseAdmin.from("ad_rules" as never).update(row as never).eq("id", input.id)
    : supabaseAdmin.from("ad_rules" as never).insert({ ...row, enabled: true, created_by: session.authId } as never);
  const { error } = await q;
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/ads/rules");
  return { success: true };
}

export async function toggleAdRule(id: string, field: "enabled" | "simulate", value: boolean): Promise<Result> {
  await requireRole([...MANAGERS]);
  const { error } = await supabaseAdmin.from("ad_rules" as never).update({ [field]: value } as never).eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/ads/rules");
  return { success: true };
}

export async function deleteAdRule(id: string): Promise<Result> {
  await requireRole(["super_admin", "admin"]);
  const { error } = await supabaseAdmin.from("ad_rules" as never).delete().eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/ads/rules");
  return { success: true };
}

export async function runAdRulesNow(): Promise<Result> {
  await requireRole(["super_admin", "admin"]);
  const r = await runAdRules();
  revalidatePath("/admin/ads/rules");
  return r.ok ? { success: true, info: `${r.rules} règle(s) vérifiée(s), ${r.actions} action(s).` } : { success: false, error: (r as { error?: string }).error };
}
