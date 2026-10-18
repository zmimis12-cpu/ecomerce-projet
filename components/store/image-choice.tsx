"use client";
/**
 * Choix d'une photo : parmi les photos du produit / la bannière de la LP, ou une photo importée.
 * Vide = automatique (comportement par défaut).
 */
import { useRef, useState, useTransition } from "react";
import { Check, Upload, Wand2, ImageOff, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type ImgCandidate = { url: string; label?: string };

export function ImageChoice({ value, onChange, candidates, autoUrl, autoLabel = "Automatique", compact = false }: {
  value: string; onChange: (url: string) => void; candidates: ImgCandidate[];
  autoUrl?: string | null; autoLabel?: string; compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const ref = useRef<HTMLInputElement>(null);
  const shown = value || autoUrl || "";
  // la photo importée apparaît aussi dans la liste
  const list = [...candidates];
  if (value && !list.some((c) => c.url === value)) list.unshift({ url: value, label: "Importée" });

  function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr("");
    if (file.size > 15 * 1024 * 1024) { setErr("Fichier trop lourd (15 MB max)."); return; }
    start(async () => {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "jpg";
      const path = `sections/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("lp-media").upload(path, file, { contentType: file.type, upsert: false, cacheControl: "31536000" });
      if (error) { setErr(error.message); return; }
      onChange(supabase.storage.from("lp-media").getPublicUrl(path).data.publicUrl);
    });
    if (ref.current) ref.current.value = "";
  }

  const tile = "relative overflow-hidden rounded-lg border bg-muted";
  const size = compact ? "h-14 w-14" : "h-20 w-20";

  const panel = open && (
    <div className={cn("flex flex-wrap gap-2 rounded-lg border bg-background p-2",
      compact && "absolute left-0 top-full z-30 mt-1 w-[min(92vw,380px)] shadow-xl")}>
      <button type="button" onClick={() => { onChange(""); if (compact) setOpen(false); }} title="Automatique"
        className={cn(tile, size, "flex flex-col items-center justify-center gap-1 text-[10px] text-muted-foreground", !value && "ring-2 ring-primary")}>
        <Wand2 className="h-4 w-4" /> Auto
      </button>
      {list.map((c) => (
        <button key={c.url} type="button" onClick={() => { onChange(c.url); if (compact) setOpen(false); }} title={c.label}
          className={cn(tile, size, value === c.url && "ring-2 ring-primary")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.url} alt="" loading="lazy" className="h-full w-full object-cover" />
          {value === c.url && <span className="absolute right-0.5 top-0.5 rounded-full bg-primary p-0.5 text-primary-foreground"><Check className="h-3 w-3" /></span>}
          {c.label && <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 text-[9px] text-white">{c.label}</span>}
        </button>
      ))}
      <label className={cn(tile, size, "flex cursor-pointer flex-col items-center justify-center gap-1 border-dashed text-[10px] text-muted-foreground hover:border-primary")}>
        <Upload className={cn("h-4 w-4", pending && "animate-pulse")} />
        {pending ? "Envoi…" : "Importer"}
        <input ref={ref} type="file" accept="image/*" onChange={upload} disabled={pending} className="hidden" />
      </label>
      {err && <p className="w-full text-xs text-red-600">{err}</p>}
    </div>
  );

  const thumb = (
    <div className={cn(tile, size, "shrink-0")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {shown ? <img src={shown} alt="" className="h-full w-full object-cover" /> : <ImageOff className="m-auto mt-[35%] h-5 w-5 text-muted-foreground" />}
    </div>
  );

  // Version compacte (liste produits) : clic sur la photo → choix en surimpression
  if (compact) {
    return (
      <div className="relative shrink-0">
        <button type="button" onClick={() => setOpen((o) => !o)} title="Changer la photo affichée dans la boutique" className="group relative block">
          {thumb}
          <span className={cn("absolute -bottom-1 -right-1 rounded-full border bg-card p-1 shadow", value ? "text-primary" : "text-muted-foreground")}>
            <Pencil className="h-3 w-3" />
          </span>
        </button>
        {panel}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        {thumb}
        <div className="space-y-1 text-xs">
          <div className="text-muted-foreground">{value ? "Photo choisie" : `${autoLabel} (par défaut)`}</div>
          <button type="button" onClick={() => setOpen((o) => !o)} className="rounded-md border px-2.5 py-1 font-medium hover:bg-muted">
            {open ? "Fermer" : "Changer la photo"}
          </button>
        </div>
      </div>
      {panel}
    </div>
  );
}
