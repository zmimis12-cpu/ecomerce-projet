"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

/** Rafraîchit la page (données Meta en direct) toutes les 60 s + bouton manuel. */
export function LiveRefresh({ fetchedAt }: { fetchedAt: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [, tick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => start(() => router.refresh()), 60_000);
    const c = setInterval(() => tick((x) => x + 1), 10_000);
    return () => { clearInterval(t); clearInterval(c); };
  }, [router]);

  const sec = Math.max(0, Math.round((Date.now() - new Date(fetchedAt).getTime()) / 1000));
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" /> En direct de Meta
      </span>
      <span>· mis à jour il y a {sec < 60 ? `${sec} s` : `${Math.round(sec / 60)} min`}</span>
      <button type="button" onClick={() => start(() => router.refresh())} disabled={pending}
        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-muted disabled:opacity-50">
        <RefreshCw className={"h-3 w-3" + (pending ? " animate-spin" : "")} /> Actualiser
      </button>
    </div>
  );
}
