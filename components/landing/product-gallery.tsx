"use client";

import { useState, useRef, useEffect } from "react";
// import { createPortal } from "react-dom";
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
  const [mounted, setMounted]         = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  // Portal requires document to be available (client-side only)
  useEffect(() => { setMounted(true); }, []);

  if (!images.length) return null;

  const active  = images[activeIndex];
  const hasPrev = activeIndex > 0;
  const hasNext = activeIndex < images.length - 1;

  // RTL page: "previous" = the image with a lower index = appears to the RIGHT
  //           "next"     = the image with a higher index = appears to the LEFT
  // So the RIGHT arrow (›) goes to the PREVIOUS image, and LEFT arrow (‹) goes to NEXT.
  function goPrev() { if (hasPrev) setActiveIndex(i => i - 1); }
  function goNext() { if (hasNext) setActiveIndex(i => i + 1); }

  // Touch/swipe handlers — in RTL, swiping LEFT shows next image (higher index)
  // and swiping RIGHT shows previous image (lower index) — same as LTR visually
  // because the physical gesture matches the visual direction on screen.
  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    // Only handle horizontal swipes (dx > dy means horizontal intent)
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
    // Swipe LEFT (dx < 0) → go to next image
    // Swipe RIGHT (dx > 0) → go to previous image
    if (dx < 0) goNext(); else goPrev();
    touchStartX.current = null;
    touchStartY.current = null;
  }

  const arrowStyle: React.CSSProperties = {
    position: "absolute", top: "50%", transform: "translateY(-50%)", zIndex: 2,
    background: "rgba(255,255,255,.88)", border: "none", cursor: "pointer",
    width: 36, height: 36, borderRadius: "50%",
    fontSize: 22, color: "#111", display: "flex", alignItems: "center", justifyContent: "center",
    boxShadow: "0 2px 8px rgba(0,0,0,.15)", lineHeight: 1,
  };

  return (
    <>
      {/* Main image */}
      <div
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{
          position: "relative", width: "100%", aspectRatio: "1/1",
          borderRadius: 18, overflow: "hidden",
          boxShadow: "0 8px 30px rgba(0,0,0,.12),0 2px 8px rgba(0,0,0,.06)",
          marginBottom: 10, background: "#f3f4f6", cursor: "zoom-in",
        }}
      >
        <Image
          src={active.public_url}
          alt={`${productName} — صورة ${activeIndex + 1}`}
          fill style={{ objectFit: "cover" }} priority={activeIndex === 0} unoptimized
          sizes="(max-width:600px) 100vw,(max-width:900px) 80vw,560px"
        />

        {/* Counter */}
        <span style={{
          position: "absolute", bottom: 10, right: 10, zIndex: 2,
          background: "rgba(0,0,0,.45)", color: "#fff",
          fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 9999,
        }}>{activeIndex + 1} / {images.length}</span>

        {/* Discount badge */}
        {discountPct > 0 && (
          <span style={{
            position: "absolute", top: 12, right: 12, zIndex: 2,
            background: "#ef4444", color: "#fff", fontWeight: 800,
            fontSize: 14, padding: "5px 11px", borderRadius: 9999,
            boxShadow: "0 3px 10px rgba(239,68,68,.4)",
          }}>-{discountPct}%</span>
        )}

        {/* NEXT arrow — LEFT side (RTL) */}
        {hasNext && (
          <button onClick={(e) => { e.stopPropagation(); goNext(); }}
            style={{ ...arrowStyle, left: 10 }} aria-label="التالي">›</button>
        )}

        {/* PREV arrow — RIGHT side (RTL) */}
        {hasPrev && (
          <button onClick={(e) => { e.stopPropagation(); goPrev(); }}
            style={{ ...arrowStyle, right: 10 }} aria-label="السابق">‹</button>
        )}
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div style={{
          display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4,
          marginBottom: 18, scrollbarWidth: "none",
        }}>
          {images.map((img, i) => (
            <button
              key={img.id}
              onClick={() => setActiveIndex(i)}
              aria-label={`صورة ${i + 1}`}
              style={{
                position: "relative", flexShrink: 0,
                width: 72, height: 72, borderRadius: 10, overflow: "hidden",
                border: `2px solid ${i === activeIndex ? "#16a34a" : "transparent"}`,
                cursor: "pointer", background: "#f3f4f6",
                transition: "border-color .15s", padding: 0,
              }}
            >
              <Image
                src={img.public_url} alt={`${productName} ${i + 1}`}
                fill style={{ objectFit: "cover" }} unoptimized sizes="80px"
              />
            </button>
          ))}
        </div>
      )}

    </>
  );
}