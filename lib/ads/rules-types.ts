/** Types et libellés partagés (client + serveur) des règles automatiques. */
export type RuleMetric =
  | "spend" | "orders" | "cost_per_order" | "delivered" | "cost_per_delivered"
  | "meta_results" | "cost_per_result" | "impressions" | "ctr" | "frequency";
export type RuleOp = ">" | ">=" | "<" | "<=";
export type RuleCondition = { metric: RuleMetric; op: RuleOp; value: number };
export type RuleWindow = "today" | "yesterday" | "3d" | "7d";
export type RuleAction = "pause" | "activate" | "notify" | "increase_budget" | "decrease_budget";
export type RuleLevel = "product" | "ad";

export const METRICS: { key: RuleMetric; label: string; unit: string }[] = [
  { key: "spend",              label: "Dépense",                 unit: "MAD" },
  { key: "orders",             label: "Commandes (système)",     unit: "" },
  { key: "cost_per_order",     label: "Coût par commande",       unit: "MAD" },
  { key: "delivered",          label: "Livrées",                 unit: "" },
  { key: "cost_per_delivered", label: "Coût par livrée",         unit: "MAD" },
  { key: "meta_results",       label: "Résultats Meta (leads)",  unit: "" },
  { key: "cost_per_result",    label: "Coût par résultat Meta",  unit: "MAD" },
  { key: "impressions",        label: "Impressions",             unit: "" },
  { key: "ctr",                label: "CTR lien",                unit: "%" },
  { key: "frequency",          label: "Fréquence",               unit: "" },
];

export const WINDOWS: { key: RuleWindow; label: string }[] = [
  { key: "today", label: "Aujourd'hui" },
  { key: "yesterday", label: "Hier" },
  { key: "3d", label: "3 derniers jours" },
  { key: "7d", label: "7 derniers jours" },
];

export const ACTIONS: { key: RuleAction; label: string }[] = [
  { key: "pause", label: "Mettre en pause" },
  { key: "activate", label: "Réactiver (seulement ce qu'une règle a mis en pause)" },
  { key: "increase_budget", label: "📈 Augmenter le budget (scaling)" },
  { key: "decrease_budget", label: "📉 Baisser le budget" },
  { key: "notify", label: "Juste noter dans le journal" },
];

export function metricLabel(k: string) { return METRICS.find((m) => m.key === k)?.label ?? k; }
export function windowLabel(k: string) { return WINDOWS.find((w) => w.key === k)?.label ?? k; }
