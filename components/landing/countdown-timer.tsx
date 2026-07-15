"use client";
import { useState, useEffect } from "react";

/** Countdown daily reset (minuit) — crée une vraie urgence sans mentir sur une deadline fixe qui expire */
export function CountdownTimer() {
  const [time, setTime] = useState<{ h: number; m: number; s: number } | null>(null);

  useEffect(() => {
    function tick() {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      const diff = Math.max(0, midnight.getTime() - now.getTime());
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTime({ h, m, s });
    }
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);

  if (!time) return null;

  return (
    <div className="lp-countdown">
      <p className="lp-countdown-label">العرض ينتهي بعد:</p>
      <div className="lp-countdown-boxes">
        {[["ساعة", time.h], ["دقيقة", time.m], ["ثانية", time.s]].map(([label, val], i) => (
          <div key={i} className="lp-countdown-box">
            <span className="lp-countdown-num">{String(val).padStart(2, "0")}</span>
            <span className="lp-countdown-unit">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
