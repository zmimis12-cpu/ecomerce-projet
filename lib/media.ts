/**
 * lib/media.ts — images publiques servies via le cache Vercel (/media/…) au lieu
 * d'être téléchargées chez Supabase à CHAQUE visite.
 * Supabase n'envoie l'image qu'une fois (puis Vercel la garde en cache 1 an)
 * → le « Cached Egress » Supabase reste très en dessous du forfait.
 * Seulement les images (les vidéos restent en lien direct).
 */
const SB = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const RE = SB
  ? new RegExp(SB.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "/storage/v1/object/public/([^\"\\s\\\\?]+?\\.(?:png|jpe?g|webp|gif|avif))", "gi")
  : null;

/** Remplace dans n'importe quelle donnée (objet, tableau, texte) les liens d'images Supabase par /media/… */
export function viaCdn<T>(x: T): T {
  if (!RE || x == null) return x;
  const s = JSON.stringify(x);
  if (!s || !s.includes("/storage/v1/object/public/")) return x;
  return JSON.parse(s.replace(RE, "/media/$1")) as T;
}
