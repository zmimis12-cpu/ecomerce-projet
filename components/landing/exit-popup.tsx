"use client";
import { useState, useEffect } from "react";

export function ExitPopup({ price }: { price: number }) {
  const [shown, setShown] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (dismissed) return;
    const handleMouseLeave = (e: MouseEvent) => {
      if (e.clientY <= 10 && !shown) {
        setShown(true);
      }
    };
    // Mobile: show after 30 seconds of inactivity
    const timer = setTimeout(() => {
      if (!shown) setShown(true);
    }, 30000);

    document.addEventListener("mouseleave", handleMouseLeave);
    return () => {
      document.removeEventListener("mouseleave", handleMouseLeave);
      clearTimeout(timer);
    };
  }, [shown, dismissed]);

  if (!shown || dismissed) return null;

  const discountPrice = Math.round(price * 2 * 0.85); // 15% off for 2 units

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9998,
      background: "rgba(0,0,0,.7)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "16px",
    }}
      onClick={() => setDismissed(true)}
    >
      <div
        style={{
          background: "#fff", borderRadius: "20px", padding: "28px 20px",
          maxWidth: "340px", width: "100%", textAlign: "center",
          position: "relative",
        }}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={() => setDismissed(true)}
          style={{
            position: "absolute", top: "12px", left: "12px",
            background: "none", border: "none", fontSize: "20px",
            cursor: "pointer", color: "#9ca3af",
          }}
        >×</button>

        <div style={{ fontSize: "40px", marginBottom: "12px" }}>🎁</div>
        <h3 style={{ fontSize: "18px", fontWeight: 900, color: "#111", marginBottom: "8px" }}>
          انتظر! عرض خاص لك
        </h3>
        <p style={{ fontSize: "14px", color: "#374151", marginBottom: "16px", lineHeight: 1.6 }}>
          احصل على <strong style={{ color: "#dc2626" }}>خصم 15%</strong> إذا طلبت قطعتين الآن!
          <br />
          <span style={{ fontSize: "12px", color: "#6b7280" }}>العرض ينتهي بعد إغلاق هذه النافذة</span>
        </p>

        <div style={{
          background: "#f0fdf4", border: "2px solid #16a34a",
          borderRadius: "12px", padding: "12px", marginBottom: "16px",
        }}>
          <p style={{ fontSize: "13px", color: "#15803d", fontWeight: 700 }}>
            قطعتان بـ <strong style={{ fontSize: "20px" }}>{discountPrice} درهم</strong>
          </p>
          <p style={{ fontSize: "11px", color: "#6b7280" }}>بدل {Math.round(price * 2)} درهم</p>
        </div>

        <a
          href="#lp-form"
          onClick={() => setDismissed(true)}
          style={{
            display: "block", background: "#16a34a", color: "#fff",
            borderRadius: "12px", padding: "14px", fontSize: "16px",
            fontWeight: 900, textDecoration: "none",
            fontFamily: "var(--font-cairo),sans-serif",
          }}
        >
          👉 استفد من العرض الآن
        </a>

        <button
          onClick={() => setDismissed(true)}
          style={{
            marginTop: "10px", background: "none", border: "none",
            color: "#9ca3af", fontSize: "12px", cursor: "pointer",
          }}
        >
          لا شكراً، لا أريد الخصم
        </button>
      </div>
    </div>
  );
}
