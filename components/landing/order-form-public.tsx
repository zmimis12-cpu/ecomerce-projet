"use client";
import { useState, useTransition } from "react";
import type { PublicProduct } from "@/lib/public/queries";

interface Props {
  product: PublicProduct;
  productSlug: string;
  ctaText?: string;
  b1: number; b2: number; b3: number; unitLabel?: string;
  cities?: string[];
}

export function OrderFormPublic({ product, productSlug, ctaText = "اطلب الآن", b1, b2, b3, unitLabel = "", cities = FALLBACK_CITIES }: Props) {
  const [isPending, startTransition] = useTransition();
  const [submitted, setSubmitted]    = useState(false);
  const [errors, setErrors]          = useState<Record<string, string>>({});
  const [serverError, setServerError]= useState("");
  const [bundle, setBundle]          = useState(1);
  const [form, setForm] = useState({
    customer_name:"", customer_phone:"", customer_city:"",
    customer_address:"", notes:"", website:"",
  });

  // Standard COD e-commerce bundle discounts: -10% for 2x, -20% for 3x
  // These match the server-side calculation in /api/public/orders so prices
  // are consistent between what the customer sees and what the order records.
  const unitPrice = b1; // sale_price_mad
  // If unitLabel is set (e.g. "10 قطع"), show 10/20/30 pcs labels
  const hasUnitLabel = unitLabel && unitLabel.trim().length > 0;
  const unitNum = hasUnitLabel ? parseInt(unitLabel.replace(/[^0-9]/g, "")) || 1 : 1;
  const bundles = [
    { qty:1, label: hasUnitLabel ? `${unitNum * 1} ${unitLabel.replace(/[0-9]/g, "").trim()}` : "1×", price: unitPrice,
      note: hasUnitLabel ? `${unitNum} قطعة` : "قطعة واحدة" },
    { qty:2, label: hasUnitLabel ? `${unitNum * 2} ${unitLabel.replace(/[0-9]/g, "").trim()}` : "2×", price: Math.round(unitPrice * 2 * 0.90),
      note:`وفّر ${Math.round(unitPrice * 2 * 0.10)} درهم`, pop:true },
    { qty:3, label: hasUnitLabel ? `${unitNum * 3} ${unitLabel.replace(/[0-9]/g, "").trim()}` : "3×", price: Math.round(unitPrice * 3 * 0.80),
      note:`وفّر ${Math.round(unitPrice * 3 * 0.20)} درهم` },
  ];
  const total = bundles.find((b) => b.qty === bundle)?.price ?? unitPrice;

  function set(key: string, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
    setErrors((e) => { const n={...e}; delete n[key]; return n; });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError("");
    startTransition(async () => {
      try {
        const res = await fetch("/api/public/orders", {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({
            ...form,
            quantity:     bundle,
            bundle_price: total,   // send the bundle total so API applies correct pricing
            product_id:   product.id,
            product_slug: productSlug,
          }),
        });
        const data = await res.json() as {
          success:boolean; orderNumber?:string;
          errors?:Record<string,string>; error?:string;
        };
        if (data.success) {
          setSubmitted(true);
          // Conversion tracking — fires only on confirmed order creation.
          // "Lead" (not "Purchase") since payment happens on delivery (COD),
          // not at submission time — this is the correct Meta standard event
          // for COD funnels and lets Meta Ads actually learn who converts.
          if (typeof window !== "undefined") {
            const w = window as unknown as { fbq?: (...args: unknown[]) => void; dataLayer?: unknown[] };
            w.fbq?.("track", "Lead", { value: total, currency: "MAD", content_name: product.name });
            w.dataLayer?.push({ event: "generate_lead", value: total, currency: "MAD", item_name: product.name });
            window.scrollTo({top:0,behavior:"smooth"});
          }
        } else if (data.errors) { setErrors(data.errors); }
        else { setServerError(data.error ?? "حدث خطأ. حاول مجدداً."); }
      } catch { setServerError("خطأ في الاتصال. حاول مجدداً."); }
    });
  }

  if (submitted) return (
    <div style={{ borderRadius:"16px", background:"#f0fdf4",
      border:"2px solid #bbf7d0", padding:"32px 24px",
      textAlign:"center", fontFamily:"var(--font-cairo),sans-serif" }}>
      <div style={{ width:"60px", height:"60px", borderRadius:"50%",
        background:"#16a34a", display:"flex", alignItems:"center",
        justifyContent:"center", margin:"0 auto 14px",
        boxShadow:"0 6px 20px rgba(22,163,74,.3)" }}>
        <span style={{ color:"white", fontSize:"28px" }}>✓</span>
      </div>
      <h3 style={{ fontSize:"19px", fontWeight:900, color:"#166534", marginBottom:"8px" }}>
        تم استلام طلبك!
      </h3>
      <p style={{ color:"#15803d", fontSize:"14px", lineHeight:1.7, marginBottom:"14px" }}>
        سيتصل بك فريقنا للتأكيد وتحديد موعد التوصيل.
      </p>
      <p style={{ fontSize:"24px", fontWeight:900, color:"#16a34a" }}>
        {total.toFixed(0)} درهم
      </p>
      <p style={{ color:"#9ca3af", fontSize:"12px", marginTop:"4px" }}>الدفع عند الاستلام</p>
    </div>
  );

  const INP = (err: boolean): React.CSSProperties => ({
    display:"block", width:"100%", height:"48px",
    borderRadius:"12px", border:`2px solid ${err ? "#f87171" : "#e5e7eb"}`,
    background:"#fff", padding:"0 14px",
    fontSize:"16px", fontFamily:"var(--font-cairo),sans-serif",
    boxSizing:"border-box", outline:"none", color:"#111827",
    WebkitAppearance:"none", appearance:"none",
    transition:"border-color .15s",
  });
  const LBL: React.CSSProperties = {
    display:"block", fontSize:"13px", fontWeight:700,
    color:"#374151", marginBottom:"5px",
  };
  const ERR = (msg: string) => msg ? (
    <p style={{ color:"#ef4444", fontSize:"11px", marginTop:"3px" }}>{msg}</p>
  ) : null;

  return (
    <form onSubmit={handleSubmit} style={{ fontFamily:"var(--font-cairo),sans-serif" }}>
      {/* Honeypot */}
      <input type="text" name="website" value={form.website}
        onChange={(e) => set("website", e.target.value)}
        style={{ position:"absolute", left:"-9999px", opacity:0 }}
        tabIndex={-1} aria-hidden="true" />

      {/* Bundle selector */}
      <div style={{ marginBottom:"18px" }}>
        <label style={LBL}>الكمية</label>
        <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
          {bundles.map((b) => (
            <button key={b.qty} type="button" onClick={() => setBundle(b.qty)}
              style={{ display:"flex", justifyContent:"space-between",
                alignItems:"center", padding:"12px 14px", borderRadius:"12px",
                border:`2px solid ${bundle===b.qty ? "#16a34a" : "#e5e7eb"}`,
                background: bundle===b.qty ? "#f0fdf4" : "#fff",
                cursor:"pointer", fontFamily:"var(--font-cairo),sans-serif",
                transition:"border-color .15s,background .15s" }}>
              <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                <div style={{ width:"18px", height:"18px", borderRadius:"50%",
                  border:`2px solid ${bundle===b.qty ? "#16a34a" : "#d1d5db"}`,
                  background: bundle===b.qty ? "#16a34a" : "transparent",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  flexShrink:0 }}>
                  {bundle===b.qty && (
                    <div style={{ width:"7px", height:"7px",
                      borderRadius:"50%", background:"#fff" }} />
                  )}
                </div>
                <span style={{ fontSize:"14px", fontWeight:700, color:"#111827" }}>
                  {b.label} — {b.note}
                  {b.pop && <span style={{ marginRight:"6px",
                    background:"#fef3c7", color:"#92400e",
                    fontSize:"10px", fontWeight:700,
                    padding:"1px 6px", borderRadius:"9999px" }}>
                    الأوفر
                  </span>}
                </span>
              </div>
              <span style={{ fontSize:"16px", fontWeight:900, color:"#16a34a" }}>
                {b.price.toFixed(0)} درهم
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Name */}
      <div style={{ marginBottom:"14px" }}>
        <label style={LBL}>الاسم الكامل *</label>
        <input type="text" value={form.customer_name}
          onChange={(e) => set("customer_name", e.target.value)}
          placeholder="مثال: محمد الأحمدي" style={INP(!!errors.customer_name)} required />
        {ERR(errors.customer_name)}
      </div>

      {/* Phone */}
      <div style={{ marginBottom:"14px" }}>
        <label style={LBL}>رقم الهاتف *</label>
        <input type="tel" value={form.customer_phone}
          onChange={(e) => set("customer_phone", e.target.value)}
          placeholder="0612345678" style={INP(!!errors.customer_phone)} required />
        {ERR(errors.customer_phone)}
      </div>

      {/* Address */}
      <div style={{ marginBottom:"14px" }}>
        <label style={LBL}>العنوان التفصيلي <span style={{color:"#9ca3af",fontWeight:400}}>(اختياري)</span></label>
        <input type="text" value={form.customer_address}
          onChange={(e) => set("customer_address", e.target.value)}
          placeholder="الحي، الشارع، رقم البناية..." style={INP(false)} />
      </div>

      {/* City */}
      <div style={{ marginBottom:"14px" }}>
        <label style={LBL}>المدينة *</label>
        <select value={form.customer_city}
          onChange={(e) => set("customer_city", e.target.value)}
          style={INP(!!errors.customer_city)} required>
          <option value="">اختر مدينتك</option>
          {cities.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {ERR(errors.customer_city)}
      </div>

      {/* Total */}
      <div style={{ borderRadius:"12px", background:"#f0fdf4",
        border:"1px solid #bbf7d0", padding:"14px 16px", marginBottom:"18px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <p style={{ fontSize:"13px", color:"#4b5563", fontWeight:600 }}>المجموع</p>
          <span style={{ fontSize:"clamp(22px,6vw,26px)", fontWeight:900, color:"#16a34a" }}>
            {total.toFixed(0)}{" "}
            <span style={{ fontSize:"13px", color:"#6b7280" }}>درهم</span>
          </span>
        </div>
        <p style={{ textAlign:"center", fontSize:"11px", color:"#15803d",
          fontWeight:600, marginTop:"6px" }}>
          الدفع عند الاستلام فقط
        </p>
      </div>

      {serverError && (
        <div style={{ borderRadius:"12px", background:"#fef2f2",
          border:"1px solid #fecaca", padding:"12px",
          color:"#dc2626", fontSize:"13px",
          textAlign:"center", marginBottom:"14px" }}>
          {serverError}
        </div>
      )}

      <button type="submit" disabled={isPending}
        style={{ display:"block", width:"100%",
          background: isPending ? "#9ca3af" : "#16a34a",
          color:"#fff", fontSize:"clamp(15px,4vw,17px)", fontWeight:800,
          padding:"15px 24px", borderRadius:"12px",
          border:"none", cursor: isPending ? "not-allowed" : "pointer",
          fontFamily:"var(--font-cairo),sans-serif", boxSizing:"border-box",
          boxShadow: isPending ? "none" : "0 3px 14px rgba(22,163,74,.28)",
          transition:"background .15s" }}>
        {isPending ? "⏳ جاري إرسال طلبك…" : `${ctaText} — ${total.toFixed(0)} درهم`}
      </button>

      <p style={{ textAlign:"center", fontSize:"11px", color:"#9ca3af", marginTop:"10px" }}>
        بياناتك محفوظة وآمنة · الدفع عند الاستلام فقط
      </p>
    </form>
  );
}

export const FALLBACK_CITIES = [
  "الدار البيضاء","الرباط","مراكش","فاس","طنجة","أكادير","مكناس","وجدة",
  "القنيطرة","تطوان","سلا","الجديدة","خريبكة","بني ملال","تازة","الناظور",
  "سطات","آسفي","العرائش","الحسيمة","الرشيدية","ورزازات","إفران","زاكورة",
  "طاطا","العيون","الداخلة","مدينة أخرى",
];
