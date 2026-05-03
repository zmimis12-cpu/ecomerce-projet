/**
 * lib/public/rate-limit.ts
 * IP-based rate limiting using the order_rate_limits table.
 * Max 3 submissions per IP per 10 minutes.
 * IP is hashed (SHA-256) before storage — we never store raw IPs.
 */
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createHash } from "crypto";

const MAX_REQUESTS  = 3;
const WINDOW_MS     = 10 * 60 * 1000; // 10 minutes

export function hashIp(ip: string): string {
  return createHash("sha256").update(ip + (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "")).digest("hex").slice(0, 32);
}

export async function checkRateLimit(ip: string): Promise<{ allowed: boolean; remaining: number }> {
  const ipHash  = hashIp(ip);
  const since   = new Date(Date.now() - WINDOW_MS).toISOString();

  const { data, error } = await supabaseAdmin
    .from("order_rate_limits")
    .select("id", { count: "exact" })
    .eq("ip_hash", ipHash)
    .gte("created_at", since);

  if (error) {
    // Fail open — don't block if rate limit table is down
    console.error("[rate-limit] check error:", error.message);
    return { allowed: true, remaining: MAX_REQUESTS };
  }

  const count     = (data?.length ?? 0);
  const remaining = Math.max(0, MAX_REQUESTS - count);
  return { allowed: count < MAX_REQUESTS, remaining };
}

export async function recordRequest(ip: string): Promise<void> {
  const ipHash = hashIp(ip);
  await supabaseAdmin
    .from("order_rate_limits")
    .insert({ ip_hash: ipHash } as never);

  // Opportunistic cleanup of old entries (async, don't await)
  supabaseAdmin.rpc("cleanup_rate_limits" as never).then(() => {}, () => {});
}

export function getClientIp(request: Request): string {
  const headers = request.headers;
  return (
    headers.get("cf-connecting-ip") ??      // Cloudflare
    headers.get("x-real-ip") ??             // Nginx
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}
