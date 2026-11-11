/** Source pub d'une commande (Google / Facebook / Instagram / TikTok…) — utilisable côté client (liste + fiche commande). */
export type OrderSourceInput = {
  user_agent?: string | null; meta_fbc?: string | null; tiktok_ttclid?: string | null;
  gclid?: string | null; utm_source?: string | null; source?: string | null;
};
export type OrderSourceTag = { key: string; label: string; cls: string };

export function orderSource(o: OrderSourceInput): OrderSourceTag | null {
  const ua = o.user_agent ?? "";
  if (o.gclid || o.utm_source === "google") return { key: "google", label: "Google", cls: "bg-amber-100 text-amber-800" };
  if (o.tiktok_ttclid || /musical_ly|trill_|BytedanceWebview|TikTok/i.test(ua) || o.utm_source === "tiktok") return { key: "tiktok", label: "TikTok", cls: "bg-zinc-800 text-white" };
  if (/Instagram/i.test(ua)) return { key: "instagram", label: "Instagram", cls: "bg-pink-100 text-pink-800" };
  if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua) || o.meta_fbc) return { key: "facebook", label: "Facebook", cls: "bg-blue-100 text-blue-800" };
  if (o.source && o.source !== "landing_page") return null; // commande saisie à la main / import
  if (!ua) return null;
  return { key: "direct", label: "Direct", cls: "bg-gray-100 text-gray-700" };
}
