"use client";

import { useState, useTransition, useRef } from "react";
import { Upload, X, Image as ImageIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// Upload DIRECT navigateur → Supabase Storage (jamais via un Server Action).
// Vercel plafonne le corps des requêtes serveur à ~4.5MB — un GIF dépasse
// souvent cette limite (erreur 413). En uploadant directement depuis le
// navigateur avec la clé anon (RLS: authentifié uniquement), on contourne
// complètement cette limite de plateforme.
export function SectionImagePicker({
  value, onChange, label,
}: { value: string | undefined; onChange: (url: string) => void; label: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    // Garde-fou taille (bucket lp-media, limite raisonnable pour un GIF/image de section)
    const MAX_MB = 15;
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`الملف كبير بزاف (الحد الأقصى ${MAX_MB}MB).`);
      return;
    }

    startTransition(async () => {
      try {
        const supabase = createClient();
        const isGif = file.type === "image/gif";
        const ext = file.name.split(".").pop() || (isGif ? "gif" : "jpg");
        const path = `sections/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("lp-media")
          .upload(path, file, { contentType: file.type, upsert: false, cacheControl: "31536000" });

        if (uploadError) {
          setError(uploadError.message || "فشل الرفع.");
          return;
        }

        const { data: urlData } = supabase.storage.from("lp-media").getPublicUrl(path);
        onChange(urlData.publicUrl);
      } catch (e) {
        setError(e instanceof Error ? e.message : "خطأ غير معروف.");
      }
    });

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {value ? (
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="h-20 w-20 rounded-lg object-cover border" />
          <button type="button" onClick={() => onChange("")}
            className="absolute -top-1.5 -right-1.5 bg-black/70 text-white rounded-full p-0.5">
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <label className="flex items-center gap-1.5 h-9 w-fit rounded-md border border-dashed border-gray-300 px-3 text-xs text-muted-foreground cursor-pointer hover:border-gray-400">
          {isPending ? <ImageIcon className="h-3.5 w-3.5 animate-pulse" /> : <Upload className="h-3.5 w-3.5" />}
          {isPending ? "Envoi..." : "Ajouter image/GIF"}
          <input ref={fileInputRef} type="file" accept="image/*,image/gif" onChange={handleUpload} disabled={isPending} className="hidden" />
        </label>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
