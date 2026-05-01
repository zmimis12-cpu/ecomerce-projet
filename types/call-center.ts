/**
 * types/call-center.ts
 */

export type CallResult =
  | "confirmed"
  | "refused"
  | "no_answer"
  | "unreachable"
  | "wrong_number"
  | "callback_requested";

export const CALL_RESULTS: CallResult[] = [
  "confirmed", "refused", "no_answer",
  "unreachable", "wrong_number", "callback_requested",
];

export const CALL_RESULT_LABELS: Record<CallResult, string> = {
  confirmed:          "Confirmé",
  refused:            "Refusé",
  no_answer:          "Sans réponse",
  unreachable:        "Injoignable",
  wrong_number:       "Mauvais numéro",
  callback_requested: "Rappel demandé",
};

export const CALL_RESULT_COLORS: Record<CallResult, { bg: string; text: string }> = {
  confirmed:          { bg: "bg-green-100",  text: "text-green-700" },
  refused:            { bg: "bg-red-100",    text: "text-red-700" },
  no_answer:          { bg: "bg-orange-100", text: "text-orange-700" },
  unreachable:        { bg: "bg-slate-100",  text: "text-slate-600" },
  wrong_number:       { bg: "bg-purple-100", text: "text-purple-700" },
  callback_requested: { bg: "bg-blue-100",   text: "text-blue-700" },
};

// Minimum call duration (seconds) before "Confirmed" is allowed
export const MIN_CONFIRM_SECONDS = 20;

export interface CallLog {
  id: string;
  order_id: string;
  agent_id: string;
  phone_dialed: string;
  call_direction: string;
  duration_seconds: number | null;
  disposition: CallResult;
  notes: string | null;
  call_started_at: string | null;
  call_ended_at: string | null;
  callback_at: string | null;
  created_at: string;
  agent?: { full_name: string } | null;
}

export interface AgentStats {
  agent_id: string;
  full_name: string;
  email: string;
  role: string;
  total_assigned: number;
  calls_made: number;
  confirmed: number;
  refused: number;
  no_answer: number;
  confirmation_rate: number;
  avg_duration_sec: number | null;
}

export interface CallCenterOrder {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  customer_city: string;
  customer_address: string;
  status: string;
  call_status: string | null;
  call_attempts: number;
  last_call_at: string | null;
  assigned_to: string | null;
  agent_name: string | null;
  notes: string | null;
  first_product_name: string | null;
  first_product_sku: string | null;
  created_at: string;
}
