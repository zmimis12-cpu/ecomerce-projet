"use client";
import { useState, useTransition } from "react";
import type { PublicProduct } from "@/lib/public/queries";

interface OrderFormPublicProps {
  product: PublicProduct;
  productSlug: string;
  ctaText?: string;
  b1: number; b2: number; b3: number;
}

export function OrderFormPublic({ product, productSlug, ctaText = "🛒 أكد الطلب", b1, b2, b3 }: OrderFormPublicProps) {
  const [isPending, startTransition] = useTransition();
  const [submitted, setSubmitted]    = useState(false);
  const [errors, setErrors]          = useState<Record<string, string>>({});
  const [serverError, setServerError]= useState("");
  const [selectedBundle, setBundle]  = useState(1);
  const [form, setForm] = useState({
    customer_name: "", customer_phone: "", customer_city: "",
    customer_address: "", notes: "", website: "",
  });

  const bundles = [
    { qty: 1, label: "قطعة واحدة",  price: b1 },
    { qty: 2, label: "قطعتين",      price: b2 },
    { qty: 3, label: "3 قطع",        price: b3 },
  ];
  const totalPrice = bundles.find((b) => b.qty === selectedBundle)?.price ?? b1;

  function set(key: string, value: string) {
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
            quantity:     selectedBundle,
            product_id:   product.id,
            product_slug: productSlug,
          }),
        });
        const data = await res.json() as { success: boolean; orderNumber?: string; errors?: Record<string, string>; error?: string };
        if (data.success) {
          setSubmitted(true);
          if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
        } else if (data.errors) {
          setErrors(data.errors);
        } else {
          setServerError(data.error ?? "حدث خطأ. يرجى المحاولة مجدداً.");
        }
      } catch { setServerError("خطأ في الاتصال. حاول مجدداً."); }
    });
  }

  if (submitted) {
    return (
      <div style={{ borderRadius: "24px", background: "linear-gradient(to bottom,#f0fdf4,#ecfdf5)", border: "2px solid #bbf7d0", padding: "32px 24px", textAlign: "center", fontFamily: "'Cairo', sans-serif" }}>
        <div style={{ width: "70px", height: "70px", borderRadius: "50%", backgroundColor: "#16a34a", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", boxShadow: "0 8px 24px rgba(22,163,74,0.3)" }}>
          <span style={{ color: "white", fontSize: "34px" }}>✓</span>
        </div>
        <h3 style={{ fontSize: "22px", fontWeight: 900, color: "#166534", margin: "0 0 8px" }}>تم استلام طلبك! 🎉</h3>
        <p style={{ color: "#15803d", fontSize: "14px", lineHeight: 1.7, margin: "0 0 16px" }}>
          سيتصل بك فريقنا خلال ساعات لتأكيد الطلب وتحديد موعد التوصيل.
        </p>
        <div style={{ backgroundColor: "white", borderRadius: "14px", padding: "14px", border: "1px solid #dcfce7" }}>
          <p style={{ fontSize: "28px", fontWeight: 900, color: "#16a34a", margin: 0 }}>{totalPrice.toFixed(0)} درهم</p>
          <p style={{ color: "#9ca3af", fontSize: "11px", margin: "4px 0 0" }}>الدفع عند الاستلام</p>
        </div>
      </div>
    );
  }

  const inp = (err: boolean): React.CSSProperties => ({
    display: "block", width: "100%", height: "48px", borderRadius: "14px",
    border: `2px solid ${err ? "#f87171" : "#e5e7eb"}`, backgroundColor: "white",
    padding: "0 14px", fontSize: "16px", fontFamily: "'Cairo', sans-serif",
    boxSizing: "border-box", outline: "none", color: "#111827",
    WebkitAppearance: "none", appearance: "none",
  });
  const lbl: React.CSSProperties = { display: "block", fontSize: "13px", fontWeight: 700, color: "#374151", marginBottom: "5px" };

  return (
    <form onSubmit={handleSubmit} style={{ fontFamily: "'Cairo', sans-serif" }}>
      <input type="text" name="website" value={form.website} onChange={(e) => set("website", e.target.value)}
        style={{ position: "absolute", left: "-9999px", opacity: 0 }} tabIndex={-1} aria-hidden="true" />

      {/* Bundle selector */}
      <div style={{ marginBottom: "18px" }}>
        <label style={lbl}>اختر الكمية</label>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {bundles.map((b) => (
            <button key={b.qty} type="button" onClick={() => setBundle(b.qty)}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "12px 16px", borderRadius: "14px", border: `2px solid ${selectedBundle === b.qty ? "#16a34a" : "#e5e7eb"}`,
                backgroundColor: selectedBundle === b.qty ? "#f0fdf4" : "white",
                cursor: "pointer", fontFamily: "'Cairo', sans-serif",
              }}>
              <span style={{ fontWeight: 700, color: "#111827", fontSize: "14px" }}>{b.qty}× — {b.label}</span>
              <span style={{ fontWeight: 900, color: "#16a34a", fontSize: "16px" }}>{b.price.toFixed(0)} درهم</span>
            </button>
          ))}
        </div>
      </div>

      {[
        { key: "customer_name",    label: "الاسم الكامل *",       type: "text",  ph: "مثال: محمد الأحمدي" },
        { key: "customer_phone",   label: "رقم الهاتف *",          type: "tel",   ph: "0612345678" },
        { key: "customer_address", label: "العنوان التفصيلي *",    type: "text",  ph: "الحي، الشارع..." },
      ].map(({ key, label, type, ph }) => (
        <div key={key} style={{ marginBottom: "14px" }}>
          <label style={lbl}>{label}</label>
          <input type={type} value={(form as Record<string,string>)[key]}
            onChange={(e) => set(key, e.target.value)}
            placeholder={ph} style={inp(!!errors[key])} required />
          {errors[key] && <p style={{ color: "#ef4444", fontSize: "11px", margin: "4px 0 0" }}>{errors[key]}</p>}
        </div>
      ))}

      {/* City */}
      <div style={{ marginBottom: "14px" }}>
        <label style={lbl}>المدينة *</label>
        <select value={form.customer_city} onChange={(e) => set("customer_city", e.target.value)}
          style={inp(!!errors.customer_city)} required>
          <option value="">اختر مدينتك</option>
          {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {errors.customer_city && <p style={{ color: "#ef4444", fontSize: "11px", margin: "4px 0 0" }}>{errors.customer_city}</p>}
      </div>

      {/* Total */}
      <div style={{ borderRadius: "16px", backgroundColor: "#f0fdf4", border: "2px solid #bbf7d0", padding: "14px 16px", marginBottom: "18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ fontSize: "14px", color: "#4b5563", fontWeight: 600, margin: 0 }}>المجموع</p>
          <span style={{ fontSize: "28px", fontWeight: 900, color: "#16a34a" }}>{totalPrice.toFixed(0)} <span style={{ fontSize: "13px", color: "#6b7280" }}>درهم</span></span>
        </div>
        <p style={{ textAlign: "center", fontSize: "11px", color: "#15803d", fontWeight: 700, margin: "8px 0 0" }}>✓ الدفع عند الاستلام فقط</p>
      </div>

      {serverError && (
        <div style={{ borderRadius: "14px", backgroundColor: "#fef2f2", border: "1px solid #fecaca", padding: "12px", color: "#dc2626", fontSize: "13px", textAlign: "center", marginBottom: "14px" }}>
          {serverError}
        </div>
      )}

      <button type="submit" disabled={isPending}
        style={{ display: "block", width: "100%", backgroundColor: isPending ? "#9ca3af" : "#16a34a", color: "white", fontSize: "19px", fontWeight: 900, padding: "17px 24px", borderRadius: "16px", border: "none", cursor: isPending ? "not-allowed" : "pointer", fontFamily: "'Cairo', sans-serif", boxSizing: "border-box", boxShadow: isPending ? "none" : "0 4px 20px rgba(22,163,74,0.35)" }}>
        {isPending ? "⏳ جاري إرسال الطلب..." : `${ctaText} — ${totalPrice.toFixed(0)} درهم`}
      </button>

      <p style={{ textAlign: "center", fontSize: "11px", color: "#9ca3af", marginTop: "10px" }}>
        🔒 بياناتك محفوظة | الدفع عند الاستلام فقط
      </p>
    </form>
  );
}

const CITIES = ["الدار البيضاء","الرباط","مراكش","فاس","طنجة","أكادير","مكناس","وجدة","القنيطرة","تطوان","سلا","الجديدة","خريبكة","بني ملال","تازة","الناظور","سطات","آسفي","العرائش","الحسيمة","الرشيدية","ورزازات","إفران","زاكورة","طاطا","العيون","الداخلة","مدينة أخرى"];
