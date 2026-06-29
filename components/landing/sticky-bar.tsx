"use client";
import { useState, useEffect } from "react";

interface Props {
  productName: string;
  price: number;
  ctaText: string;
}

export function StickyBar({ productName, price, ctaText }: Props) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const form = document.getElementById("lp-form");
    if (!form) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Hide sticky bar when form is visible on screen
        setHidden(entry.isIntersecting);
      },
      { threshold: 0.2 }
    );

    observer.observe(form);
    return () => observer.disconnect();
  }, []);

  if (hidden) return null;

  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50,
      background: "#fff", borderTop: "1px solid #e5e7eb",
      padding: "10px 16px 14px",
      boxShadow: "0 -4px 16px rgba(0,0,0,.1)",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: "12px",
        maxWidth: "580px", margin: "0 auto",
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontWeight: 700, fontSize: "11px", color: "#111",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{productName}</p>
          <p style={{ fontSize: "18px", fontWeight: 900, color: "#16a34a", lineHeight: 1.1 }}>
            {price.toFixed(0)} <small style={{ fontSize: "11px" }}>درهم</small>
          </p>
        </div>
        <a
          href="#lp-form"
          style={{
            flexShrink: 0,
            background: "#16a34a", color: "#fff",
            fontFamily: "var(--font-cairo),sans-serif",
            fontSize: "13px", fontWeight: 800,
            padding: "11px 18px", borderRadius: "12px",
            textDecoration: "none",
            boxShadow: "0 2px 10px rgba(22,163,74,.3)",
          }}
        >
          👉 {ctaText}
        </a>
      </div>
    </div>
  );
}
