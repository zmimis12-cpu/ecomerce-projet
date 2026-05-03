"use client";
import { useState, useEffect } from "react";

export function StockCounter() {
  const [stock, setStock] = useState<number | null>(null);

  useEffect(() => {
    const seed = Math.floor(Date.now() / 86400000);
    const base = 7 + (seed % 9); // 7-15, consistent per day
    setStock(base);

    const interval = setInterval(() => {
      setStock((s) => {
        if (s === null || s <= 3) return s;
        return Math.random() > 0.7 ? s - 1 : s;
      });
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  // Render nothing on server — avoids hydration mismatch
  if (stock === null) return null;

  const isLow = stock <= 5;

  return (
    <div style={{ textAlign: "right" }}>
      <p style={{ color: "#6b7280", fontSize: "11px", margin: "0 0 4px" }}>المخزون المتبقي</p>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", justifyContent: "flex-end" }}>
        <div style={{ display: "flex", gap: "2px" }}>
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              style={{
                width: "10px",
                height: "10px",
                borderRadius: "2px",
                backgroundColor: i < Math.min(stock, 5) ? "#22c55e" : "#e5e7eb",
              }}
            />
          ))}
        </div>
        <span style={{
          fontSize: "12px",
          fontWeight: 900,
          color: isLow ? "#dc2626" : "#374151",
        }}>
          {stock} قطعة فقط
        </span>
      </div>
      {isLow && (
        <p style={{
          color: "#dc2626",
          fontSize: "11px",
          fontWeight: 700,
          margin: "3px 0 0",
          textAlign: "right",
        }}>
          ⚠️ يكاد ينفد!
        </p>
      )}
    </div>
  );
}
