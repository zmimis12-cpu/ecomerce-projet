/**
 * GET /api/tiktok/callback — retour de l'autorisation TikTok (bouton "Connecter TikTok").
 * TikTok renvoie ?auth_code=…&state=… → on obtient un token permanent + les comptes.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { checkOAuthState, exchangeTikTokCode } from "@/lib/ads/tiktok-accounts";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await requireRole(["super_admin", "admin"]);
  const code = req.nextUrl.searchParams.get("auth_code") ?? req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const back = new URL("/admin/settings/ads", req.url);
  if (!code) { back.searchParams.set("tiktok", "error"); back.searchParams.set("msg", "Autorisation annulée"); return NextResponse.redirect(back); }
  if (!(await checkOAuthState(state))) { back.searchParams.set("tiktok", "error"); back.searchParams.set("msg", "Lien expiré, recommence"); return NextResponse.redirect(back); }
  try {
    const r = await exchangeTikTokCode(code);
    back.searchParams.set("tiktok", "ok"); back.searchParams.set("msg", `${r.accounts} compte(s) TikTok connecté(s)`);
  } catch (e) {
    back.searchParams.set("tiktok", "error"); back.searchParams.set("msg", e instanceof Error ? e.message : String(e));
  }
  return NextResponse.redirect(back);
}
