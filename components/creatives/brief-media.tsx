"use client";
/**
 * Photos & vidéos réelles du produit pour les éditeurs.
 * Admin : import (photos compressées automatiquement dans le navigateur, vidéos gardées en qualité d'origine).
 * Éditeur : galerie, lecture des vidéos, téléchargement.
 */
import { useRef, useState } from "react";
import { Upload, Trash2, Download, X, Play, Loader2, ImagePlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { createBriefUploadUrl, addBriefMedia, removeBriefMedia } from "@/lib/creatives/portal-actions";
import type { BriefMedia } from "@/lib/creatives/portal-shared";
import { cn } from "@/lib/utils";

const MAX_SIDE = 2560;          // photos : 2560 px max (largement assez pour un montage)
const VIDEO_MAX_MB = 500;       // limite du stockage
const mb = (n: number) => (n / 1024 / 1024).toFixed(n > 10 * 1024 * 1024 ? 0 : 1) + " Mo";

/** Réduit une photo trop lourde (ex : 12 Mo → ~1 Mo) sans perte visible. HEIC/GIF : gardés tels quels. */
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.size < 1.2 * 1024 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // format non lisible par le navigateur (ex : HEIC) → envoyé tel quel
  }
}

type Job = { id: string; name: string; status: string; error?: boolean };

export function BriefMediaManager({ productId, initial }: { productId: string; initial: BriefMedia[] }) {
  const [media, setMedia] = useState<BriefMedia[]>(initial);
  const [jobs, setJobs] = useState<Job[]>([]);
  const ref = useRef<HTMLInputElement>(null);
  const setJob = (id: string, patch: Partial<Job>) => setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...patch } : j)));

  async function handle(files: FileList | null) {
    if (!files?.length) return;
    const list = [...files];
    if (ref.current) ref.current.value = "";
    const supabase = createClient();
    for (const f of list) {
      const id = Math.random().toString(36).slice(2);
      const isVideo = f.type.startsWith("video/");
      setJobs((js) => [...js, { id, name: f.name, status: isVideo ? `Envoi (${mb(f.size)})…` : "Compression…" }]);
      try {
        if (isVideo && f.size > VIDEO_MAX_MB * 1024 * 1024) throw new Error(`Vidéo trop lourde (${mb(f.size)}, max ${VIDEO_MAX_MB} Mo) — mets-la sur Drive et colle le lien dans « Liens utiles ».`);
        if (!isVideo && !f.type.startsWith("image/")) throw new Error("Seulement des photos ou des vidéos.");
        const file = isVideo ? f : await compressImage(f);
        if (!isVideo) setJob(id, { status: file.size < f.size ? `Envoi (${mb(f.size)} → ${mb(file.size)})…` : `Envoi (${mb(file.size)})…` });
        const u = await createBriefUploadUrl(productId, file.name);
        if (!u.success || !u.data) throw new Error(u.error ?? "Échec");
        const { error } = await supabase.storage.from("ad-media").uploadToSignedUrl(u.data.path, u.data.token, file, { contentType: file.type || undefined });
        if (error) throw new Error(error.message);
        const item = { path: u.data.path, type: (isVideo ? "video" : "image") as BriefMedia["type"], name: f.name, size: file.size };
        const r = await addBriefMedia(productId, item);
        if (!r.success) throw new Error(r.error ?? "Échec");
        const url = supabase.storage.from("ad-media").getPublicUrl(u.data.path).data.publicUrl;
        setMedia((m) => [...m, { ...item, url, addedAt: new Date().toISOString() }]);
        setJobs((js) => js.filter((j) => j.id !== id));
      } catch (e) {
        setJob(id, { status: e instanceof Error ? e.message : "Erreur", error: true });
      }
    }
  }

  async function remove(m: BriefMedia) {
    if (!confirm(`Supprimer « ${m.name} » ?`)) return;
    const r = await removeBriefMedia(productId, m.path);
    if (r.success) setMedia((x) => x.filter((y) => y.path !== m.path));
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Photos & vidéos réelles du produit (visibles par les éditeurs)</span>
        <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted">
          <Upload className="h-3.5 w-3.5" /> Importer
          <input ref={ref} type="file" multiple accept="image/*,video/*" className="hidden" onChange={(e) => handle(e.target.files)} />
        </label>
      </div>
      <p className="text-[11px] text-muted-foreground">Photos lourdes compressées automatiquement (max {MAX_SIDE} px). Vidéos gardées en qualité d&apos;origine (max {VIDEO_MAX_MB} Mo).</p>
      {jobs.map((j) => (
        <div key={j.id} className={cn("flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs", j.error ? "border-red-300 text-red-700" : "")}>
          {!j.error && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          <span className="truncate font-medium">{j.name}</span><span className="ml-auto text-muted-foreground">{j.status}</span>
          {j.error && <button onClick={() => setJobs((js) => js.filter((x) => x.id !== j.id))}><X className="h-3.5 w-3.5" /></button>}
        </div>
      ))}
      {media.length === 0 && jobs.length === 0 && (
        <button type="button" onClick={() => ref.current?.click()} className="flex w-full flex-col items-center gap-1 rounded-lg border border-dashed py-5 text-xs text-muted-foreground hover:border-primary">
          <ImagePlus className="h-5 w-5" /> Ajoute des photos et vidéos réelles du produit
        </button>
      )}
      <MediaGrid media={media} onRemove={remove} />
    </div>
  );
}

export function BriefMediaGallery({ media }: { media: BriefMedia[] }) {
  if (!media?.length) return null;
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium">Photos & vidéos réelles du produit ({media.length})</div>
      <MediaGrid media={media} />
    </div>
  );
}

function MediaGrid({ media, onRemove }: { media: BriefMedia[]; onRemove?: (m: BriefMedia) => void }) {
  const [open, setOpen] = useState<BriefMedia | null>(null);
  const dl = (m: BriefMedia) => `${m.url}?download=${encodeURIComponent(m.name)}`;
  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {media.map((m) => (
          <div key={m.path} className="group relative aspect-square overflow-hidden rounded-lg border bg-black">
            <button type="button" onClick={() => setOpen(m)} className="block h-full w-full">
              {m.type === "image"
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={m.url} alt={m.name} loading="lazy" className="h-full w-full object-cover" />
                : <>
                    <video src={`${m.url}#t=0.5`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
                    <span className="absolute inset-0 flex items-center justify-center"><span className="rounded-full bg-black/60 p-2"><Play className="h-4 w-4 fill-white text-white" /></span></span>
                  </>}
            </button>
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-1 bg-gradient-to-t from-black/70 to-transparent p-1">
              <a href={dl(m)} title="Télécharger" className="rounded bg-white/90 p-1 text-neutral-900"><Download className="h-3.5 w-3.5" /></a>
              {onRemove && <button type="button" onClick={() => onRemove(m)} title="Supprimer" className="rounded bg-white/90 p-1 text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>}
            </div>
          </div>
        ))}
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={() => setOpen(null)}>
          <div className="relative max-h-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            {open.type === "image"
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={open.url} alt={open.name} className="max-h-[85vh] max-w-full rounded-lg object-contain" />
              : <video src={open.url} controls autoPlay playsInline className="max-h-[85vh] max-w-full rounded-lg" />}
            <div className="mt-2 flex items-center justify-between gap-3 text-sm text-white">
              <span className="truncate">{open.name} · {mb(open.size)}</span>
              <span className="flex gap-2">
                <a href={dl(open)} className="inline-flex items-center gap-1 rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-neutral-900"><Download className="h-3.5 w-3.5" /> Télécharger</a>
                <button onClick={() => setOpen(null)} className="rounded-md border border-white/40 px-3 py-1.5 text-xs">Fermer</button>
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
