"use client";
import { useState, useTransition } from "react";
import type { PublicProduct } from "@/lib/public/queries";

interface OrderFormProps {
  product: PublicProduct;
  productSlug: string;
}

export function OrderForm({ product, productSlug }: OrderFormProps) {
  const [isPending, startTransition] = useTransition();
  const [submitted, setSubmitted]    = useState(false);
  const [errors, setErrors]          = useState<Record<string, string>>({});
  const [serverError, setServerError]= useState("");
  const [form, setForm] = useState({
    customer_name: "", customer_phone: "", customer_city: "",
    customer_address: "", quantity: 1, notes: "", website: "",
  });

  const total = product.sale_price_mad * form.quantity;

  function set(key: string, value: string | number) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => { const n = { ...e }; delete n[key]; return n; });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError("");
    startTransition(async () => {
      try {
        const res = await fetch("/api/public/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            product_id:   product.id,
            product_slug: productSlug,
          }),
        });
        const data = await res.json() as {
          success: boolean;
          orderNumber?: string;
          errors?: Record<string, string>;
          error?: string;
        };
        if (data.success) {
          setSubmitted(true);
          if (typeof window !== "undefined") {
            window.scrollTo({ top: 0, behavior: "smooth" });
          }
        } else if (data.errors) {
          setErrors(data.errors);
        } else {
          setServerError(data.error ?? "حدث خطأ. يرجى المحاولة مجدداً.");
        }
      } catch {
        setServerError("خطأ في الاتصال. حاول مجدداً.");
      }
    });
  }

  if (submitted) {
    return (
      <div style={{
        borderRadius: "24px",
        background: "linear-gradient(to bottom, #f0fdf4, #ecfdf5)",
        border: "2px solid #bbf7d0",
        padding: "32px 24px",
        textAlign: "center",
      }}>
        <div style={{
          width: "72px", height: "72px", borderRadius: "50%",
          backgroundColor: "#16a34a",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 16px",
          boxShadow: "0 8px 24px rgba(22,163,74,0.3)",
        }}>
          <span style={{ color: "white", fontSize: "36px" }}>✓</span>
        </div>
        <h3 style={{ fontSize: "22px", fontWeight: 900, color: "#166534", margin: "0 0 8px" }}>
          تم استلام طلبك! 🎉
        </h3>
        <p style={{ color: "#15803d", fontSize: "15px", lineHeight: 1.6, margin: "0 0 16px" }}>
          سيتصل بك فريقنا خلال ساعات لتأكيد الطلب وتحديد موعد التوصيل.
        </p>
        <div style={{
          backgroundColor: "white", borderRadius: "14px",
          padding: "14px", border: "1px solid #dcfce7", marginBottom: "12px",
        }}>
          <p style={{ color: "#6b7280", fontSize: "13px", margin: "0 0 2px" }}>سعر الطلب</p>
          <p style={{ fontSize: "30px", fontWeight: 900, color: "#16a34a", margin: "0 0 2px" }}>{total.toFixed(0)} درهم</p>
          <p style={{ color: "#9ca3af", fontSize: "12px", margin: 0 }}>الدفع عند الاستلام فقط</p>
        </div>
        <p style={{ color: "#6b7280", fontSize: "13px", margin: 0 }}>شكراً لثقتك بنا ❤️</p>
      </div>
    );
  }

  const inp = (hasError: boolean): React.CSSProperties => ({
    display: "block",
    width: "100%",
    height: "48px",
    borderRadius: "14px",
    border: `2px solid ${hasError ? "#f87171" : "#e5e7eb"}`,
    backgroundColor: "white",
    padding: "0 14px",
    fontSize: "16px",           // 16px prevents iOS zoom-in on focus
    fontFamily: "var(--font-cairo), sans-serif",
    boxSizing: "border-box",
    outline: "none",
    color: "#111827",
    appearance: "none",
    WebkitAppearance: "none",
  });

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "14px",
    fontWeight: 700,
    color: "#374151",
    marginBottom: "6px",
  };

  return (
    <form onSubmit={handleSubmit} style={{ fontFamily: "var(--font-cairo), sans-serif" }}>
      {/* Honeypot */}
      <input
        type="text" name="website" value={form.website}
        onChange={(e) => set("website", e.target.value)}
        style={{ position: "absolute", left: "-9999px", opacity: 0 }}
        tabIndex={-1} aria-hidden="true"
      />

      {/* Name */}
      <div style={{ marginBottom: "16px" }}>
        <label style={labelStyle}>الاسم الكامل *</label>
        <input
          type="text" value={form.customer_name}
          onChange={(e) => set("customer_name", e.target.value)}
          placeholder="مثال: محمد الأحمدي"
          style={inp(!!errors.customer_name)}
          required
        />
        {errors.customer_name && <p style={{ color: "#ef4444", fontSize: "12px", margin: "4px 0 0" }}>{errors.customer_name}</p>}
      </div>

      {/* Phone */}
      <div style={{ marginBottom: "16px" }}>
        <label style={labelStyle}>رقم الهاتف *</label>
        <input
          type="tel" value={form.customer_phone}
          onChange={(e) => set("customer_phone", e.target.value)}
          placeholder="0612345678"
          style={inp(!!errors.customer_phone)}
          required
        />
        {errors.customer_phone && <p style={{ color: "#ef4444", fontSize: "12px", margin: "4px 0 0" }}>{errors.customer_phone}</p>}
      </div>

      {/* City */}
      <div style={{ marginBottom: "16px" }}>
        <label style={labelStyle}>المدينة *</label>
        <div style={{ position: "relative" }}>
          <select
            value={form.customer_city}
            onChange={(e) => set("customer_city", e.target.value)}
            style={{ ...inp(!!errors.customer_city), paddingLeft: "14px", cursor: "pointer" }}
            required
          >
            <option value="">اختر مدينتك</option>
            {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {errors.customer_city && <p style={{ color: "#ef4444", fontSize: "12px", margin: "4px 0 0" }}>{errors.customer_city}</p>}
      </div>

      {/* Address */}
      <div style={{ marginBottom: "16px" }}>
        <label style={labelStyle}>العنوان التفصيلي *</label>
        <input
          type="text" value={form.customer_address}
          onChange={(e) => set("customer_address", e.target.value)}
          placeholder="الحي، الشارع، رقم البناية..."
          style={inp(!!errors.customer_address)}
          required
        />
        {errors.customer_address && <p style={{ color: "#ef4444", fontSize: "12px", margin: "4px 0 0" }}>{errors.customer_address}</p>}
      </div>

      {/* Quantity */}
      <div style={{ marginBottom: "16px" }}>
        <label style={labelStyle}>الكمية</label>
        <div style={{
          display: "flex", alignItems: "center", gap: "0",
          backgroundColor: "#f9fafb", borderRadius: "14px",
          border: "2px solid #e5e7eb", overflow: "hidden",
        }}>
          <button
            type="button"
            onClick={() => set("quantity", Math.max(1, form.quantity - 1))}
            style={{
              width: "52px", height: "52px", fontSize: "24px", fontWeight: 700,
              backgroundColor: "transparent", border: "none", cursor: "pointer",
              color: "#374151", flexShrink: 0,
            }}
          >−</button>
          <span style={{
            flex: 1, textAlign: "center", fontSize: "22px",
            fontWeight: 900, color: "#111827",
          }}>{form.quantity}</span>
          <button
            type="button"
            onClick={() => set("quantity", Math.min(10, form.quantity + 1))}
            style={{
              width: "52px", height: "52px", fontSize: "24px", fontWeight: 700,
              backgroundColor: "transparent", border: "none", cursor: "pointer",
              color: "#374151", flexShrink: 0,
            }}
          >+</button>
        </div>
      </div>

      {/* Notes */}
      <div style={{ marginBottom: "20px" }}>
        <label style={labelStyle}>ملاحظات (اختياري)</label>
        <textarea
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="أي تعليمات إضافية..."
          rows={2}
          style={{
            display: "block", width: "100%", borderRadius: "14px",
            border: "2px solid #e5e7eb", backgroundColor: "white",
            padding: "12px 14px", fontSize: "16px",
            fontFamily: "var(--font-cairo), sans-serif",
            boxSizing: "border-box", resize: "none", outline: "none",
            color: "#111827",
          }}
        />
      </div>

      {/* Total */}
      <div style={{
        borderRadius: "16px", backgroundColor: "#f0fdf4",
        border: "2px solid #bbf7d0", padding: "16px", marginBottom: "20px",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ fontSize: "14px", color: "#4b5563", fontWeight: 600, margin: "0 0 2px" }}>إجمالي طلبك</p>
            <p style={{ fontSize: "12px", color: "#9ca3af", margin: 0 }}>
              {form.quantity} × {product.sale_price_mad.toFixed(0)} درهم
            </p>
          </div>
          <div style={{ textAlign: "left" }}>
            <span style={{ fontSize: "32px", fontWeight: 900, color: "#16a34a" }}>{total.toFixed(0)}</span>
            <span style={{ fontSize: "15px", fontWeight: 700, color: "#6b7280", marginRight: "4px" }}>درهم</span>
          </div>
        </div>
        <p style={{ textAlign: "center", fontSize: "12px", color: "#15803d", fontWeight: 700, margin: "10px 0 0" }}>
          ✓ الدفع عند الاستلام — ما فيه مخاطرة
        </p>
      </div>

      {serverError && (
        <div style={{
          borderRadius: "14px", backgroundColor: "#fef2f2",
          border: "1px solid #fecaca", padding: "12px 16px",
          color: "#dc2626", fontSize: "14px", textAlign: "center", marginBottom: "16px",
        }}>
          {serverError}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={isPending}
        style={{
          display: "block", width: "100%",
          backgroundColor: isPending ? "#9ca3af" : "#16a34a",
          color: "white", fontSize: "20px", fontWeight: 900,
          padding: "18px 24px", borderRadius: "16px",
          border: "none", cursor: isPending ? "not-allowed" : "pointer",
          fontFamily: "var(--font-cairo), sans-serif",
          boxSizing: "border-box",
          boxShadow: isPending ? "none" : "0 4px 20px rgba(22,163,74,0.35)",
          transition: "background-color 0.2s",
        }}
      >
        {isPending ? "⏳ جاري إرسال الطلب..." : `🛒 أكد الطلب — ${total.toFixed(0)} درهم`}
      </button>

      <p style={{ textAlign: "center", fontSize: "12px", color: "#9ca3af", marginTop: "12px" }}>
        🔒 بياناتك محفوظة وآمنة تماماً | الدفع عند الاستلام فقط
      </p>
    </form>
  );
}

const CITIES = [
  "الدار البيضاء","الرباط","مراكش","فاس","طنجة","أكادير","مكناس","وجدة",
  "القنيطرة","تطوان","سلا","الجديدة","خريبكة","بني ملال","تازة","الناظور",
  "سطات","آسفي","العرائش","الحسيمة","الرشيدية","ورزازات","إفران","زاكورة",
  "طاطا","العيون","الداخلة","مدينة أخرى",
];
