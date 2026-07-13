"use client";

import { useState, useTransition, useRef } from "react";
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
  const [media, setMedia] = useState(initialMedia);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    startTransition(async () => {
      const res = await addProductWhatsAppMedia(productId, formData);
      if (!res.success) { setError(res.error ?? "Erreur upload."); return; }
      router.refresh();
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function remove(id: string, storagePath: string | null) {
    setMedia((m) => m.filter((x) => x.id !== id));
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
        {isPending ? "Envoi..." : "Ajouter une photo ou vidéo"}
        <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={handleUpload} disabled={isPending} className="hidden" />
      </label>

      {error && <p className="text-xs text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</p>}

      {media.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {media.map((m) => (
            <div key={m.id} className="relative group rounded-lg overflow-hidden border aspect-square bg-gray-50">
              {m.media_type === "video" ? (
                <div className="flex items-center justify-center h-full">
                  <Video className="h-6 w-6 text-muted-foreground" />
                </div>
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
