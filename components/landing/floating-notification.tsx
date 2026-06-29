"use client";
import { useState, useEffect } from "react";

const NOTIFICATIONS = [
  { name: "سارة", city: "الدار البيضاء", time: 2 },
  { name: "محمد", city: "مراكش", time: 5 },
  { name: "فاطمة", city: "الرباط", time: 8 },
  { name: "يوسف", city: "فاس", time: 3 },
  { name: "خديجة", city: "أكادير", time: 12 },
  { name: "عمر", city: "طنجة", time: 7 },
  { name: "نجاة", city: "مكناس", time: 4 },
  { name: "إدريس", city: "القنيطرة", time: 6 },
];

export function FloatingNotification() {
  const [visible, setVisible] = useState(false);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    // Show first notification after 4 seconds
    const first = setTimeout(() => setVisible(true), 4000);
    return () => clearTimeout(first);
  }, []);

  useEffect(() => {
    if (!visible) return;
    // Hide after 4 seconds
    const hide = setTimeout(() => {
      setVisible(false);
      // After hiding, rotate to next and show again after 5 seconds
      setTimeout(() => {
        setCurrent(c => (c + 1) % NOTIFICATIONS.length);
        setVisible(true);
      }, 5000);
    }, 4000);
    return () => clearTimeout(hide);
  }, [visible]);

  if (!visible) return null;

  const n = NOTIFICATIONS[current];
  return (
    <div style={{
      position: "fixed", bottom: "80px", left: "12px", zIndex: 55,
      background: "#fff", borderRadius: "14px", padding: "10px 14px",
      boxShadow: "0 4px 20px rgba(0,0,0,.15)", border: "1px solid #e5e7eb",
      display: "flex", alignItems: "center", gap: "10px",
      maxWidth: "240px", animation: "slideInLeft .4s ease",
    }}>
      <div style={{
        width: "36px", height: "36px", borderRadius: "50%",
        background: "#16a34a", color: "#fff", display: "flex",
        alignItems: "center", justifyContent: "center",
        fontSize: "16px", flexShrink: 0,
      }}>🛍️</div>
      <div>
        <p style={{ fontSize: "12px", fontWeight: 700, color: "#111", marginBottom: "2px" }}>
          {n.name} من {n.city}
        </p>
        <p style={{ fontSize: "11px", color: "#6b7280" }}>
          طلبت هذا المنتج منذ {n.time} دقائق
        </p>
      </div>
      <style>{`@keyframes slideInLeft{from{opacity:0;transform:translateX(-20px)}to{opacity:1;transform:translateX(0)}}`}</style>
    </div>
  );
}
