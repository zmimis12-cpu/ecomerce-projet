/**
 * POST /api/webhooks/speedaf — suivi des colis en temps réel (Speedaf Open API §5.5).
 * Signature : X-Speedaf-Signature = hmac-sha256=HEX(HMAC_SHA256(secretKey, timestamp + "\n" + rawBody)).
 * Si la signature ne peut pas être vérifiée (secretKey pas encore fourni par Speedaf),
 * on n'utilise PAS le contenu reçu : on relit le statut directement chez Speedaf.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { readSpeedafConfig } from "@/lib/delivery/speedaf/config";
import { SpeedafClient, type SpeedafTrack } from "@/lib/delivery/speedaf/client";
import { applySpeedafTrack } from "@/lib/delivery/speedaf/sync";

export const dynamic = "force-dynamic";

const ok = () => NextResponse.json({ success: true, error: null, data: null });

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const cfg = await readSpeedafConfig();
  if (!cfg.enabled) return ok();

  let body: { mailNo?: string; tracks?: SpeedafTrack[] } = {};
  try { body = JSON.parse(raw); } catch {
    return NextResponse.json({ success: false, error: "invalid json", data: null }, { status: 400 });
  }

  const ts = req.headers.get("x-speedaf-timestamp") ?? "";
  const sig = (req.headers.get("x-speedaf-signature") ?? "").replace(/^hmac-sha256=/i, "").toLowerCase();
  let trusted = false;
  if (cfg.secretKey && ts && sig) {
    const expected = createHmac("sha256", cfg.secretKey).update(`${ts}\n${raw}`).digest("hex");
    const fresh = Math.abs(Date.now() - Number(ts)) < 10 * 60_000;
    trusted = fresh && expected.length === sig.length && timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
    // Signature invalide (clé différente ?) → on ne rejette pas : le contenu est ignoré
    // et le statut est relu chez Speedaf ci-dessous (aucune mise à jour perdue).
    if (!trusted) console.warn("[speedaf-webhook] signature non vérifiée → relecture API");
  }

  const mailNo = String(body.mailNo ?? body.tracks?.[0]?.mailNo ?? "").trim();
  if (!mailNo) return ok();

  try {
    let tracks = body.tracks ?? [];
    if (!trusted) {
      // Pas de clé → on ne fait confiance qu'à l'API Speedaf
      const r = await new SpeedafClient(cfg).track([mailNo]);
      tracks = r.ok ? (r.data?.[0]?.tracks ?? []) : [];
    }
    const last = [...tracks].sort((a, b) => String(a.time).localeCompare(String(b.time))).pop();
    if (last) await applySpeedafTrack(mailNo, { ...last, mailNo }, "webhook");
  } catch (e) {
    console.error("[speedaf-webhook]", e);
    // 500 → Speedaf réessaiera plus tard
    return NextResponse.json({ success: false, error: "processing failed", data: null }, { status: 500 });
  }
  return ok();
}
