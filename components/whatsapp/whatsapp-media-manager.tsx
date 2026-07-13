"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Upload, Trash2, Video, Image as ImageIcon } from "lucide-react";
import { addProductWhatsAppMedia, deleteProductWhatsAppMedia } from "@/lib/whatsapp/actions";

interface Media {
  id: string;
  media_url: string;
  media_type: string;
  storage_path: string | null;
  display_order: number;
}

export function WhatsAppMediaManager({ productId, initialMedia }: { productId: string; initialMedia: Media[] }) {
  // On se resynchronise sur initialMedia à chaque re-render serveur (après
  // router.refresh()) — sans ça, la state locale reste figée sur l'ancienne
  // liste et rien ne semble apparaître après upload.
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  useEffect(() => { setDeletedIds(new Set()); }, [initialMedia]);
  const media = initialMedia.filter((m) => !deletedIds.has(m.id));

  const [isPending, startTransition] = useTransition();
  const [uploadingCount, setUploadingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setError(null);
    setUploadingCount(files.length);

    startTransition(async () => {
      const errors: string[] = [];
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await addProductWhatsAppMedia(productId, formData);
        if (!res.success) errors.push(`${file.name}: ${res.error ?? "erreur inconnue"}`);
      }
      setUploadingCount(0);
      if (errors.length > 0) setError(errors.join(" | "));
      router.refresh();
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function remove(id: string, storagePath: string | null) {
    setDeletedIds((prev) => new Set(prev).add(id));
    startTransition(async () => {
      await deleteProductWhatsAppMedia(id, storagePath);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Photos/vidéos WhatsApp</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Envoyées automatiquement au client après le message de confirmation, pour montrer le produit en vrai.
        </p>
      </div>

      <label className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 py-4 text-sm text-muted-foreground cursor-pointer hover:border-gray-400">
        <Upload className="h-4 w-4" />
        {isPending ? `Envoi... (${uploadingCount})` : "Ajouter des photos/vidéos (plusieurs à la fois)"}
        <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple onChange={handleUpload} disabled={isPending} className="hidden" />
      </label>

      {error && <p className="text-xs text-red-600 bg-red-50 rounded-md px-3 py-2 whitespace-pre-wrap">{error}</p>}

      {media.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {media.map((m) => (
            <div key={m.id} className="relative group rounded-lg overflow-hidden border aspect-square bg-gray-50">
              {m.media_type === "video" ? (
                <video src={m.media_url} className="w-full h-full object-cover" muted />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.media_url} alt="" className="w-full h-full object-cover" />
              )}
              <button type="button" onClick={() => remove(m.id, m.storage_path)}
                className="absolute top-1 right-1 bg-black/60 text-white rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Trash2 className="h-3 w-3" />
              </button>
              <span className="absolute bottom-1 left-1 bg-black/60 text-white rounded px-1 text-[10px] flex items-center gap-0.5">
                {m.media_type === "video" ? <Video className="h-2.5 w-2.5" /> : <ImageIcon className="h-2.5 w-2.5" />}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
