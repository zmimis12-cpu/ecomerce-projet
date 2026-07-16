"use client";

import { useState, useTransition, useRef } from "react";
import { Upload, X, Image as ImageIcon } from "lucide-react";
import { uploadSectionMedia } from "@/lib/landing-pages/actions";

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
    const formData = new FormData();
    formData.append("file", file);
    startTransition(async () => {
      const res = await uploadSectionMedia(formData);
      if (!res.success || !res.url) { setError(res.error ?? "Erreur upload."); return; }
      onChange(res.url);
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
