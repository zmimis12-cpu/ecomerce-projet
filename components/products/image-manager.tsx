"use client";

import { useState, useTransition, useRef } from "react";
import { uploadProductImage, setPrimaryImage, deleteProductImage } from "@/lib/products/actions";
import { cn } from "@/lib/utils";
import type { ProductImage } from "@/types/products";
import { Star, Trash2, Upload, ImageIcon, ZoomIn } from "lucide-react";

interface ImageManagerProps {
  productId: string;
  images: ProductImage[];
}

export function ImageManager({ productId, images: initialImages }: ImageManagerProps) {
  const [images, setImages] = useState<ProductImage[]>(initialImages);
  const [isPending, startTransition] = useTransition();
  const [dragOver, setDragOver] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }
  function showError(msg: string) { setError(msg); setTimeout(() => setError(null), 5000); }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    const fd = new FormData();
    fd.set("file", file);
    startTransition(async () => {
      const result = await uploadProductImage(productId, fd);
      if (result.success && result.image) {
        const img = result.image as unknown as ProductImage;
        setImages((prev) => [...prev, img]);
        showToast("Image uploadée avec succès.");
      } else {
        showError(result.error ?? "Erreur upload.");
      }
    });
  }

  async function handleSetPrimary(imageId: string) {
    startTransition(async () => {
      const result = await setPrimaryImage(productId, imageId);
      if (result.success) {
        setImages((prev) => prev.map((img) => ({ ...img, is_primary: img.id === imageId })));
        showToast("Image principale mise à jour.");
      } else showError(result.error ?? "Erreur.");
    });
  }

  async function handleDelete(image: ProductImage) {
    if (!confirm("Supprimer cette image ?")) return;
    startTransition(async () => {
      const result = await deleteProductImage(productId, image.id, image.storage_path);
      if (result.success) {
        setImages((prev) => prev.filter((img) => img.id !== image.id));
        showToast("Image supprimée.");
      } else showError(result.error ?? "Erreur suppression.");
    });
  }

  return (
    <div className="space-y-4">
      {/* Feedback */}
      {toast && (
        <div className="rounded-lg bg-green-600 text-white text-sm px-4 py-2 font-medium">✓ {toast}</div>
      )}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="Aperçu"
            className="max-w-full max-h-full rounded-xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute top-4 right-4 text-white bg-white/20 hover:bg-white/40 rounded-full h-9 w-9 flex items-center justify-center text-lg font-bold transition-colors"
            onClick={() => setLightbox(null)}
          >
            ✕
          </button>
        </div>
      )}

      {/* Upload zone */}
      <div
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
          dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-secondary/30",
          isPending && "opacity-50 pointer-events-none"
        )}
      >
        <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
        <p className="text-sm font-medium">
          {isPending ? "Upload en cours…" : "Glissez une image ou cliquez pour sélectionner"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">JPEG, PNG, WebP — Max 5MB</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {/* Image grid */}
      {images.length === 0 ? (
        <div className="rounded-xl border bg-secondary/20 flex flex-col items-center justify-center py-12">
          <ImageIcon className="h-10 w-10 text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">Aucune image</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {images.map((img) => (
            <div
              key={img.id}
              className={cn(
                "relative group rounded-lg overflow-hidden border-2 aspect-square bg-secondary/20",
                img.is_primary ? "border-primary" : "border-transparent"
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.public_url}
                alt={img.file_name ?? "Product image"}
                className="w-full h-full object-cover cursor-zoom-in"
                onClick={() => setLightbox(img.public_url)}
              />

              {img.is_primary && (
                <div className="absolute top-1.5 left-1.5 bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded font-medium">
                  Principale
                </div>
              )}

              {/* Hover actions */}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                {/* Zoom */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setLightbox(img.public_url); }}
                  className="p-1.5 rounded bg-white/20 hover:bg-white/40 transition-colors text-white"
                  title="Agrandir"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                {/* Set primary */}
                {!img.is_primary && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleSetPrimary(img.id); }}
                    disabled={isPending}
                    className="p-1.5 rounded bg-white/20 hover:bg-white/40 transition-colors text-white"
                    title="Définir comme principale"
                  >
                    <Star className="h-4 w-4" />
                  </button>
                )}
                {/* Delete */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleDelete(img); }}
                  disabled={isPending}
                  className="p-1.5 rounded bg-red-500/80 hover:bg-red-600 transition-colors text-white"
                  title="Supprimer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
