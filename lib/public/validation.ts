/**
 * lib/public/validation.ts
 * Input validation + phone normalization for public order intake.
 * Pure functions — no side effects, no DB calls.
 */

export interface OrderFormInput {
  customer_name:    string;
  customer_phone:   string;
  customer_city:    string;
  customer_address: string;
  quantity:         number;
  notes:            string;
  website:          string;  // honeypot
}

export interface ValidationResult {
  ok:     boolean;
  errors: Record<string, string>;
  phone?: string; // normalized phone if valid
}

// ─── Phone normalization ───────────────────────────────────────────────────────
const MA_MOBILE_RE = /^(?:\+?212|0)(6|7)\d{8}$/;

export function normalizePhone(raw: string): string | null {
  // Chiffres arabes (٠١٢…), persans (۰۱۲…) et pleine largeur (０１２…) → 0123… ; 00212… → +212… ; 6XXXXXXXX (sans 0) → 06XXXXXXXX
  let digits = raw
    .replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (c) => String(c.charCodeAt(0) - 0x06F0))
    .replace(/[\uFF10-\uFF19]/g, (c) => String(c.charCodeAt(0) - 0xFF10))
    .replace(/[\s\-\.\(\)\u200e\u200f\u202a-\u202e]/g, "");
  if (digits.startsWith("00212")) digits = "+" + digits.slice(2);
  if (/^[67]\d{8}$/.test(digits)) digits = "0" + digits;
  if (!MA_MOBILE_RE.test(digits)) return null;

  // Normalize to 0XXXXXXXXX format
  if (digits.startsWith("+212")) return "0" + digits.slice(4);
  if (digits.startsWith("212"))  return "0" + digits.slice(3);
  return digits;
}

// ─── Main validation ───────────────────────────────────────────────────────────
export function validateOrderInput(
  input: OrderFormInput
): ValidationResult {
  const errors: Record<string, string> = {};

  // 1. Honeypot — silent reject (return ok=true to not alert bots)
  if (input.website && input.website.trim() !== "") {
    return { ok: true, errors: {}, phone: "" }; // silently accept but caller should drop
  }

  // 2. Name
  const name = input.customer_name.trim();
  if (!name || name.length < 2) {
    errors.customer_name = "الاسم مطلوب (حرفان على الأقل)";
  }

  // 3. Phone
  const phone = normalizePhone(input.customer_phone);
  if (!phone) {
    errors.customer_phone = "رقم الهاتف غير صحيح (مثال: 0612345678)";
  }

  // 4. City
  const city = input.customer_city.trim();
  if (!city || city.length < 2) {
    errors.customer_city = "المدينة مطلوبة";
  }

  // 5. Address — optional for COD
  // const address = input.customer_address.trim();
  // if (!address || address.length < 5) {
  //   errors.customer_address = "العنوان مطلوب (5 أحرف على الأقل)";
  // }

  // 6. Quantity
  const qty = Number(input.quantity);
  if (!Number.isInteger(qty) || qty < 1 || qty > 10) {
    errors.quantity = "الكمية يجب أن تكون بين 1 و 10";
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    phone: phone ?? undefined,
  };
}

// ─── Honeypot detection ────────────────────────────────────────────────────────
export function isHoneypotTriggered(website: string): boolean {
  return website.trim() !== "";
}
