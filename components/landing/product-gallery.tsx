"use client";

import { useState } from "react";
import Image from "next/image";

interface ProductImage {
  id: string;
  public_url: string;
  is_primary: boolean;
  display_order: number;
}

interface Props {
  images: ProductImage[];
  productName: string;
  discountPct?: number;
}

export function ProductGallery({ images, productName, discountPct = 0 }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightbox, setLightbox] = useState(false);

  if (!images.length) return null;

  const active = images[activeIndex];

  return (
    <>
      {/* Main image with navigation arrows */}
      <div
        className="lp-gallery-main"
        onClick={() => setLightbox(true)}
        style={{ cursor: "zoom-in" }}
      >
        <Image
          src={active.public_url}
          alt={`${productName} — صورة ${activeIndex + 1}`}
          fill className="lp-img" priority={activeIndex === 0} unoptimized
          sizes="(max-width:600px) 100vw,(max-width:900px) 80vw,560px"
        />
        {/* Image counter */}
        <span className="lp-gallery-counter">{activeIndex + 1} / {images.length}</span>
        {/* Discount badge */}
        {discountPct > 0 && (
          <span style={{
            position: "absolute", top: 12, left: 12, zIndex: 2,
            background: "#ef4444", color: "#fff", fontWeight: 800,
            fontSize: 14, padding: "5px 11px", borderRadius: 9999,
            boxShadow: "0 3px 10px rgba(239,68,68,.4)",
          }}>-{discountPct}%</span>
        )}

        {/* Arrow prev */}
        {activeIndex > 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); setActiveIndex(i => i - 1); }}
            className="lp-gallery-arrow lp-gallery-arrow--prev" aria-label="السابق">
            ‹
          </button>
        )}
        {/* Arrow next */}
        {activeIndex < images.length - 1 && (
          <button
            onClick={(e) => { e.stopPropagation(); setActiveIndex(i => i + 1); }}
            className="lp-gallery-arrow lp-gallery-arrow--next" aria-label="التالي">
            ›
          </button>
        )}
      </div>

      {/* Thumbnails row */}
      {images.length > 1 && (
        <div className="lp-thumbs">
          {images.map((img, i) => (
            <button
              key={img.id}
              onClick={() => setActiveIndex(i)}
              className={`lp-thumb ${i === activeIndex ? "lp-thumb--active" : ""}`}
              aria-label={`صورة ${i + 1}`}
            >
              <Image
                src={img.public_url} alt={`${productName} ${i + 1}`}
                fill className="lp-img" unoptimized
                sizes="80px"
              />
            </button>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          onClick={() => setLightbox(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 100,
            background: "rgba(0,0,0,.88)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "16px", cursor: "zoom-out",
          }}
        >
          <div style={{ position: "relative", width: "100%", maxWidth: "520px", aspectRatio: "1/1" }}>
            <Image
              src={active.public_url} alt={productName}
              fill style={{ objectFit: "contain" }} unoptimized
            />
          </div>
          <button
            onClick={() => setLightbox(false)}
            style={{
              position: "absolute", top: 16, right: 16,
              background: "rgba(255,255,255,.15)", border: "none",
              color: "#fff", borderRadius: "50%", width: 36, height: 36,
              fontSize: 20, cursor: "pointer", display: "flex",
              alignItems: "center", justifyContent: "center",
            }}
            aria-label="إغلاق"
          >×</button>
          {/* Lightbox navigation */}
          {activeIndex > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setActiveIndex(i => i - 1); }}
              style={{
                position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)",
                background: "rgba(255,255,255,.2)", border: "none", color: "#fff",
                borderRadius: "50%", width: 44, height: 44, fontSize: 24, cursor: "pointer",
              }}
            >‹</button>
          )}
          {activeIndex < images.length - 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setActiveIndex(i => i + 1); }}
              style={{
                position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)",
                background: "rgba(255,255,255,.2)", border: "none", color: "#fff",
                borderRadius: "50%", width: 44, height: 44, fontSize: 24, cursor: "pointer",
              }}
            >›</button>
          )}
        </div>
      )}
    </>
  );
}
