"use client";
// Compte à rebours LP : date de fin RÉELLE (endMs) ou "daily" (minuit Maroc). Caché quand c'est fini.
import { useEffect, useState } from "react";

const nextMidnightMa = () => { const n = Date.now() + 36e5; return n - (n % 864e5) + 864e5 - 36e5; };

export function LpCountdown({ endMs, daily, text }: { endMs: number; daily: boolean; text?: string }) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    let end = daily ? nextMidnightMa() : endMs;
    const tick = () => {
      let d = end - Date.now();
      if (d <= 0 && daily) { end = nextMidnightMa(); d = end - Date.now(); }
      setLeft(d > 0 ? d : 0);
      return d > 0;
    };
    if (!tick()) return;
    const iv = setInterval(() => { if (!tick()) clearInterval(iv); }, 1000);
    return () => clearInterval(iv);
  }, [endMs, daily]);
  if (!left) return null;
  const z = (n: number) => (n < 10 ? "0" : "") + n;
  const v = { d: Math.floor(left / 864e5), h: Math.floor(left / 36e5) % 24, m: Math.floor(left / 6e4) % 60, s: Math.floor(left / 1e3) % 60 };
  const parts: [keyof typeof v, string][] = [["d", "يوم"], ["h", "ساعة"], ["m", "دقيقة"], ["s", "ثانية"]];
  return (
    <div className="sh-cd">
      <div className="sh-cd-t">{text || "⏳ العرض كيسالي من بعد"}</div>
      <div className="sh-cd-b" dir="ltr">
        {parts.filter(([k]) => k !== "d" || v.d > 0).map(([k, l]) => <span key={k}><b>{z(v[k])}</b><i>{l}</i></span>)}
      </div>
    </div>
  );
}
