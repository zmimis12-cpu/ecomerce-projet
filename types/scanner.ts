/**
 * types/scanner.ts
 */

export type ScanType = "exit" | "return";

export type ReturnCondition =
  | "good"
  | "damaged"
  | "missing_items"
  | "lost"
  | "client_refused"
  | "wrong_item";

export const RETURN_CONDITIONS: ReturnCondition[] = [
  "good", "damaged", "missing_items", "lost", "client_refused", "wrong_item",
];

export const RETURN_CONDITION_LABELS: Record<ReturnCondition, string> = {
  good:           "Bon état",
  damaged:        "Endommagé",
  missing_items:  "Pièces manquantes",
  lost:           "Perdu",
  client_refused: "Refusé par le client",
  wrong_item:     "Mauvais article",
};

export const RETURN_CONDITION_COLORS: Record<ReturnCondition, { bg: string; text: string }> = {
  good:           { bg: "bg-green-100",  text: "text-green-700" },
  damaged:        { bg: "bg-red-100",    text: "text-red-700" },
  missing_items:  { bg: "bg-orange-100", text: "text-orange-700" },
  lost:           { bg: "bg-slate-100",  text: "text-slate-600" },
  client_refused: { bg: "bg-purple-100", text: "text-purple-700" },
  wrong_item:     { bg: "bg-amber-100",  text: "text-amber-700" },
};

/** Can the condition be restocked? */
export function canRestock(condition: ReturnCondition): boolean {
  return condition === "good";
}

/** Is this condition a financial loss? */
export function isLoss(condition: ReturnCondition): boolean {
  return ["damaged", "lost", "missing_items"].includes(condition);
}

export interface ScanResult {
  success: boolean;
  isDuplicate: boolean;
  orderId: string | null;
  orderNumber: string | null;
  customerName: string | null;
  trackingNumber: string;
  message: string;
  error?: string;
}

export interface ReturnItem {
  id: string;
  return_id: string;
  order_item_id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  quantity: number;
  condition: ReturnCondition;
  returned_qty: number;
  good_qty: number;
  damaged_qty: number;
  missing_qty: number;
  restocked_qty: number;
  unit_cost_mad: number | null;
  write_off_value: number | null;
  restocked: boolean;
  notes: string | null;
  created_at: string;
}

export interface Return {
  id: string;
  return_number: string;
  order_id: string;
  order_number?: string;
  customer_name?: string;
  reason: string;
  condition: ReturnCondition;
  status: string;
  refund_amount: number;
  carrier_cost: number;
  write_off_amount: number;
  total_loss_mad: number | null;
  claim_amount_mad: number | null;
  received_at: string | null;
  inspected_at: string | null;
  inspection_notes: string | null;
  created_at: string;
  items?: ReturnItem[];
}
