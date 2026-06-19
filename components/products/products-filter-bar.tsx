"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  activePeriod: string;
  from: string;
  to: string;
}

const PRESETS = [
  { label: "Aujourd'hui", days: 1  },
  { label: "3 jours",     days: 3  },
  { label: "15 jours",    days: 15 },
  { label: "30 jours",    days: 30 },
];

export function ProductsFilterBar({ activePeriod, from, to }: Props) {
  const router = useRouter();
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo]     = useState(to);
  const [showCustom, setShowCustom] = useState(false);

  function applyCustom() {
    if (!customFrom || !customTo) return;
    router.push(`?from=${customFrom}&to=${customTo}`);
    setShowCustom(false);
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Preset buttons */}
      {PRESETS.map((p) => (
        <a key={p.days}
          href={`?period=${p.days}`}
          className={[
            "rounded-full px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
            String(p.days) === activePeriod && !showCustom
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
          ].join(" ")}>
          {p.label}
        </a>
      ))}

      {/* Custom date range toggle */}
      <button
        onClick={() => setShowCustom((v) => !v)}
        className={[
          "rounded-full px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
          showCustom
            ? "bg-primary text-primary-foreground"
            : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
        ].join(" ")}>
        Personnalisé
      </button>

      {/* Custom date inputs — shown inline when toggled */}
      {showCustom && (
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date" value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="rounded-md border px-2 py-1 text-xs" />
          <span className="text-xs text-muted-foreground">→</span>
          <input
            type="date" value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="rounded-md border px-2 py-1 text-xs" />
          <button
            onClick={applyCustom}
            disabled={!customFrom || !customTo}
            className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium disabled:opacity-50">
            Appliquer
          </button>
        </div>
      )}
    </div>
  );
}
