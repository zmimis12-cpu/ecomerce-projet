"use client";
/**
 * Filtre de période du dashboard — PAR MOIS (défaut : mois en cours),
 * « Tout » (depuis le début) ou dates personnalisées.
 * URL : ?from=YYYY-MM-DD&to=YYYY-MM-DD  ·  ?period=all pour tout voir.
 */
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { CalendarDays } from "lucide-react";

const MOIS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];

function todayMa() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Casablanca" });
}
function lastDay(y: number, m: number) { // m: 1-12
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
/** 12 derniers mois : { key: "2026-10", label, from, to } */
function months() {
  const t = todayMa();
  let y = Number(t.slice(0, 4)), m = Number(t.slice(5, 7));
  const out: { key: string; label: string; from: string; to: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    const end = i === 0 ? t : lastDay(y, m);
    out.push({ key, label: `${MOIS[m - 1]} ${y}${i === 0 ? " (en cours)" : ""}`, from: `${key}-01`, to: end });
    m--; if (m === 0) { m = 12; y--; }
  }
  return out;
}

export function DateRangeFilter({ from: curFrom, to: curTo, all }: { from: string; to: string; all: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const list = months();
  const match = all ? "all" : (list.find((x) => x.from === curFrom && (x.to === curTo || x.to.slice(0, 7) === curTo.slice(0, 7) && curTo >= x.to))?.key ?? "custom");
  const [mode, setMode] = useState(match);
  const [from, setFrom] = useState(curFrom);
  const [to, setTo] = useState(curTo);

  function push(params: Record<string, string | null>) {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(params)) { if (v) p.set(k, v); else p.delete(k); }
    router.push(`${pathname}${p.toString() ? `?${p}` : ""}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
      <select
        value={mode}
        onChange={(e) => {
          const v = e.target.value;
          setMode(v);
          if (v === "all") return push({ period: "all", from: null, to: null });
          if (v === "custom") return;
          const x = list.find((m) => m.key === v)!;
          setFrom(x.from); setTo(x.to);
          push({ period: null, from: x.from, to: x.to });
        }}
        className="h-9 rounded-lg border bg-background px-3 text-sm capitalize"
      >
        {list.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        <option value="all">Tout (depuis le début)</option>
        <option value="custom">Dates personnalisées…</option>
      </select>
      {mode === "custom" && (
        <>
          <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)}
            className="h-9 rounded-lg border bg-background px-2 text-sm" />
          <span className="text-sm text-muted-foreground">→</span>
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)}
            className="h-9 rounded-lg border bg-background px-2 text-sm" />
          <button disabled={!from || !to} onClick={() => push({ period: null, from, to })}
            className="h-9 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50">
            Appliquer
          </button>
        </>
      )}
    </div>
  );
}
