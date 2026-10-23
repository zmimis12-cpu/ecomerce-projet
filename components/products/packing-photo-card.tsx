"use client";
import { useState, useTransition } from "react";
import { ImageChoice } from "@/components/store/image-choice";
import { savePackingPhoto } from "@/lib/products/packing-photo-actions";

/** Fiche produit → photo affichée sur le récap des tickets (équipe d'emballage). */
export function PackingPhotoCard({ productId, value, images }: {
  productId: string; value: string; images: { url: string; label?: string }[];
}) {
  const [url, setUrl] = useState(value);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const primary = images[0]?.url ?? null;
  const shown = url || primary;

  function choose(u: string) {
    setUrl(u); setMsg("");
    start(async () => {
      const r = await savePackingPhoto(productId, u);
      setMsg(r.success ? "✅ Enregistré" : `❌ ${r.error}`);
    });
  }

  return (
    <div className="rounded-xl border bg-card p-5 space-y-3">
      <div>
        <h3 className="text-sm font-semibold">📦 Photo emballage (récap tickets)</h3>
        <p className="text-xs text-muted-foreground">Photo imprimée à côté du nom sur le récap, pour que l&apos;équipe reconnaisse le produit. Idéal : le produit seul sur fond blanc. Auto = photo principale.</p>
      </div>
      <div className="flex items-start gap-3">
        <ImageChoice value={url} onChange={choose} candidates={images} autoUrl={primary} autoLabel="Photo principale" />
        {shown && (
          <div className="space-y-1 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shown} alt="" className="h-20 w-20 rounded-lg border-2 border-black object-cover grayscale contrast-125" />
            <span className="block text-[10px] text-muted-foreground">Aperçu impression</span>
          </div>
        )}
      </div>
      {(pending || msg) && <p className="text-xs">{pending ? "Enregistrement…" : msg}</p>}
    </div>
  );
}
