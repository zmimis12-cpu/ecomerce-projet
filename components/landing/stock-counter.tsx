"use client";
import { useState, useEffect } from "react";

export function StockCounter() {
  // Start with a random stock between 7-15, decrease over time for urgency
  const [stock, setStock] = useState<number | null>(null);

  useEffect(() => {
    // Seed based on date so it's consistent per day but feels real
    const seed = Math.floor(Date.now() / 86400000);
    const base = 7 + (seed % 9); // 7-15
    setStock(base);

    // Decrease every 45-90 seconds to simulate buying activity
    const interval = setInterval(() => {
      setStock((s) => {
        if (s === null || s <= 3) return s;
        return Math.random() > 0.7 ? s - 1 : s;
      });
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  if (stock === null) return null;

  return (
    <div className="text-left">
      <p className="text-xs text-gray-500 mb-1">المخزون المتبقي</p>
      <div className="flex items-center gap-1.5">
        <div className="flex gap-0.5">
          {[...Array(5)].map((_, i) => (
            <div key={i} className={`h-2.5 w-2.5 rounded-sm ${i < Math.min(stock, 5) ? "bg-green-500" : "bg-gray-200"}`} />
          ))}
        </div>
        <span className={`text-xs font-black ${stock <= 5 ? "text-red-600" : "text-gray-700"}`}>
          {stock} قطعة فقط
        </span>
      </div>
      {stock <= 5 && (
        <p className="text-xs text-red-600 font-bold mt-0.5 animate-pulse">⚠️ يكاد ينفد!</p>
      )}
    </div>
  );
}
