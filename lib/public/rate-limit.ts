/**
 * lib/public/rate-limit.ts
 * IP-based rate limiting — server-side only.
 * IP is hashed (SHA-256 + salt) before storage. Raw IP never stored.
 * SALT: uses HASH_SALT env var (not the service role key).
 */
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createHash } from "crypto";

const MAX_REQUESTS = 3;
const WINDOW_MS    = 10 * 60 * 1000; // 10 minutes

/** Hash an IP address with a secret salt — never store raw IPs */
export function hashIp(ip: string): string {
  // Use dedicated HASH_SALT env var — never the service role key
  const salt = process.env.HASH_SALT ?? "gestionpro-default-salt-change-in-prod";
  return createHash("sha256")
    .update(ip + salt)
    .digest("hex")
    .slice(0, 32);
}

export async function checkRateLimit(ip: string): Promise<{ allowed: boolean; remaining: number }> {
  const ipHash = hashIp(ip);
  const since  = new Date(Date.now() - WINDOW_MS).toISOString();

  const { data, error } = await supabaseAdmin
    .from("order_rate_limits")
    .select("id", { count: "exact" })
    .eq("ip_hash", ipHash)
    .gte("created_at", since);

  if (error) {
    console.error("[rate-limit] check error:", error.message);
    return { allowed: true, remaining: MAX_REQUESTS }; // fail open
  }

  const count     = data?.length ?? 0;
  const remaining = Math.max(0, MAX_REQUESTS - count);
  return { allowed: count < MAX_REQUESTS, remaining };
}

export async function recordRequest(ip: string): Promise<void> {
  const ipHash = hashIp(ip);
  await supabaseAdmin
    .from("order_rate_limits")
    .insert({ ip_hash: ipHash } as never);

  // Async cleanup — don't await
  supabaseAdmin.rpc("cleanup_rate_limits" as never).then(() => {}, () => {});
}

export function getClientIp(request: Request): string {
  const h = request.headers;
  return (
    h.get("cf-connecting-ip") ??
    h.get("x-real-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}
