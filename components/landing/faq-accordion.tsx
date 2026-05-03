"use client";
import { useState } from "react";

interface FaqItem { q: string; a: string; }

export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
      {items.map((item, i) => (
        <div key={i} style={{
          borderRadius:"12px", border:"1px solid #e5e7eb",
          overflow:"hidden", background:"white",
        }}>
          <button
            type="button"
            onClick={() => setOpen(open === i ? null : i)}
            style={{
              width:"100%", display:"flex", justifyContent:"space-between",
              alignItems:"center", padding:"14px 16px",
              background:"none", border:"none", cursor:"pointer",
              fontFamily:"'Cairo',sans-serif", textAlign:"right",
              gap:"12px",
            }}
          >
            <span style={{ fontSize:"14px", fontWeight:700, color:"#111827",
              flex:1, textAlign:"right" }}>
              {item.q}
            </span>
            <span style={{
              width:"22px", height:"22px", borderRadius:"50%",
              background: open === i ? "#16a34a" : "#f3f4f6",
              color: open === i ? "white" : "#6b7280",
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:"16px", fontWeight:700, flexShrink:0,
              transition:"background .2s",
              lineHeight:1,
            }}>
              {open === i ? "−" : "+"}
            </span>
          </button>
          {open === i && (
            <div style={{ padding:"0 16px 14px" }}>
              <p style={{ fontSize:"13px", color:"#4b5563", lineHeight:1.7 }}>
                {item.a}
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
