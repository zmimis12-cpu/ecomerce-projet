"use client";
import { useState, useEffect } from "react";

export function StockCounter({ variant = "light" }: { variant?: "light" | "dark" }) {
  const [stock, setStock] = useState<number | null>(null);

  useEffect(() => {
    const seed = Math.floor(Date.now() / 86400000);
    const base = 7 + (seed % 9);
    setStock(base);
    const iv = setInterval(() => {
      setStock((s) => (s !== null && s > 3 && Math.random() > 0.7) ? s - 1 : s);
    }, 60000);
    return () => clearInterval(iv);
  }, []);

  if (stock === null) return null;
  const isLow = stock <= 5;
  const dark = variant === "dark";

  return (
    <div style={{ textAlign: dark ? "center" : "right" }}>
      <p style={{ color: dark ? "#d1d5db" : "#9ca3af", fontSize:"11px", marginBottom:"4px" }}>المخزون</p>
      <div style={{ display:"flex", alignItems:"center", gap:"5px", justifyContent: dark ? "center" : "flex-end" }}>
        <div style={{ display:"flex", gap:"2px" }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{ width:"9px", height:"9px", borderRadius:"2px",
              background: i < Math.min(stock, 5) ? (dark ? "#f5c744" : "#16a34a") : (dark ? "rgba(255,255,255,.2)" : "#e5e7eb") }} />
          ))}
        </div>
        <span style={{ fontSize:"12px", fontWeight:800,
          color: isLow ? "#dc2626" : (dark ? "#fff" : "#374151") }}>
          {stock} فقط
        </span>
      </div>
      {isLow && (
        <p style={{ color:"#dc2626", fontSize:"10px", fontWeight:700,
          marginTop:"2px", textAlign: dark ? "center" : "right" }}>
          يكاد ينفد
        </p>
      )}
    </div>
  );
}
