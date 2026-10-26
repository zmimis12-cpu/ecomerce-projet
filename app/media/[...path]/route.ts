/**
 * GET /media/<bucket>/<chemin> — copie en cache (Vercel CDN, 1 an) des images publiques Supabase.
 * Les fichiers ont des noms uniques → contenu immuable → cache longue durée sans risque.
 */
export const runtime = "edge";

const SB = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const ALLOWED = /^(product-images|lp-media|ad-media|whatsapp-media)\/[^?#]+\.(png|jpe?g|webp|gif|avif)$/i;

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const rel = path.map((p) => encodeURIComponent(decodeURIComponent(p))).join("/");
  if (!SB || !ALLOWED.test(decodeURIComponent(rel))) return new Response("Not found", { status: 404 });

  // 1 nouvel essai si Supabase répond mal (sinon l'image du hero reste cassée chez le client)
  let upstream = await fetch(`${SB}/storage/v1/object/public/${rel}`);
  if (!upstream.ok || !upstream.body) upstream = await fetch(`${SB}/storage/v1/object/public/${rel}`, { cache: "no-store" });
  if (!upstream.ok || !upstream.body) {
    // Jamais mis en cache : une panne passagère ne doit pas casser l'image pendant 1 min pour tout le monde
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
      "CDN-Cache-Control": "public, max-age=31536000, immutable",
      "Vercel-CDN-Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
