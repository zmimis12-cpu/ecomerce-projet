/**
 * lib/delivery/phone-utils.ts
 * Pure utility — no "use server" (peut être importé partout, sync).
 */

/** Normalize Moroccan phone to exactly 10 digits starting with 0 */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("212") && digits.length === 12) return "0" + digits.slice(3);
  if (digits.startsWith("0")   && digits.length === 10) return digits;
  // pad/truncate to 10
  return ("0" + digits).slice(-10).padStart(10, "0");
}

/** Convert local Moroccan phone (0XXXXXXXXX) to international format (+212XXXXXXXXX) for WhatsApp/Twilio */
export function toInternationalMorocco(phone: string): string {
  const local = normalizePhone(phone);
  return "+212" + local.slice(1);
}
