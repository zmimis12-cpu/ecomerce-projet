"use client";
/**
 * Mesure du parcours sur la landing page (où les visiteurs abandonnent).
 * 1 seul envoi par visite (sendBeacon quand la page est quittée / cachée) → coût Supabase/Vercel minime.
 * Étapes : visite → scroll 25/50/75/100 → formulaire touché → nom / téléphone / ville → clic commander → erreur ? → commande OK.
 */
import { useEffect } from "react";

export function LpFunnelTracker({ slug }: { slug: string }) {
  useEffect(() => {
    const t0 = Date.now();
    const st = { scroll: 0, fields: new Set<string>(), click: 0, errs: [] as string[], ok: false, sent: false };
    const cr = new URLSearchParams(location.search).get("cr") ?? "";
    const src = /instagram/i.test(navigator.userAgent) ? "ig" : /FBAN|FBAV|FB_IAB/i.test(navigator.userAgent) ? "fb" : "web";

    const onScroll = () => {
      const h = document.documentElement.scrollHeight - innerHeight;
      const p = h > 0 ? Math.round((scrollY / h) * 100) : 100;
      if (p > st.scroll) st.scroll = Math.min(100, p);
    };
    const onLpf = (e: Event) => {
      const d = (e as CustomEvent<{ t: string; f?: string }>).detail;
      if (d.t === "f" && d.f) st.fields.add(d.f);
      else if (d.t === "click") st.click++;
      else if (d.t === "err" && d.f && st.errs.length < 5) st.errs.push(d.f);
      else if (d.t === "ok") { st.ok = true; send(); }
    };
    const send = () => {
      if (st.sent) return;
      st.sent = true;
      const body = JSON.stringify({
        slug, cr, src, s: st.scroll, f: [...st.fields], c: st.click, e: st.errs, ok: st.ok,
        sec: Math.round((Date.now() - t0) / 1000),
      });
      try {
        if (!navigator.sendBeacon?.("/api/public/lp-funnel", new Blob([body], { type: "application/json" })))
          fetch("/api/public/lp-funnel", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => {});
      } catch { /* rien */ }
    };
    const onHide = () => { if (document.visibilityState === "hidden") send(); };

    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("lpf", onLpf);
    document.addEventListener("visibilitychange", onHide);
    addEventListener("pagehide", send);
    return () => {
      removeEventListener("scroll", onScroll);
      removeEventListener("lpf", onLpf);
      document.removeEventListener("visibilitychange", onHide);
      removeEventListener("pagehide", send);
    };
  }, [slug]);
  return null;
}
