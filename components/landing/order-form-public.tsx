"use client";
import { useState, useTransition } from "react";
import type { PublicProduct } from "@/lib/public/queries";

interface Props {
  product: PublicProduct;
  productSlug: string;
  ctaText?: string;
  b1: number; b2: number; b3: number;
}

export function OrderFormPublic({ product, productSlug, ctaText = "اطلب الآن", b1, b2, b3 }: Props) {
  const [isPending, startTransition] = useTransition();
  const [submitted, setSubmitted]    = useState(false);
  const [errors, setErrors]          = useState<Record<string, string>>({});
  const [serverError, setServerError]= useState("");
  const [bundle, setBundle]          = useState(1);
  const [form, setForm] = useState({
    customer_name:"", customer_phone:"", customer_city:"",
    customer_address:"", notes:"", website:"",
  });

  const bundles = [
    { qty:1, label:"قطعة واحدة", price:b1 },
    { qty:2, label:"قطعتين",     price:b2, saving:`وفّر ${(b1*2-b2).toFixed(0)} درهم` },
    { qty:3, label:"3 قطع",      price:b3, saving:`وفّر ${(b1*3-b3).toFixed(0)} درهم` },
  ];
  const total = bundles.find((b) => b.qty === bundle)?.price ?? b1;

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
          body: JSON.stringify({ ...form, quantity:bundle,
            product_id:product.id, product_slug:productSlug }),
        });
        const data = await res.json() as {
          success:boolean; orderNumber?:string;
          errors?:Record<string,string>; error?:string;
        };
        if (data.success) {
          setSubmitted(true);
          if (typeof window !== "undefined") window.scrollTo({top:0,behavior:"smooth"});
        } else if (data.errors) { setErrors(data.errors); }
        else { setServerError(data.error ?? "حدث خطأ. حاول مجدداً."); }
      } catch { setServerError("خطأ في الاتصال. حاول مجدداً."); }
    });
  }

  const F: React.CSSProperties = {
    fontFamily:"'Cairo',sans-serif",
  };

  if (submitted) return (
    <div style={{ borderRadius:"16px", background:"#f0fdf4",
      border:"2px solid #bbf7d0", padding:"32px 24px",
      textAlign:"center", ...F }}>
      <div style={{ width:"64px", height:"64px", borderRadius:"50%",
        background:"#16a34a", display:"flex", alignItems:"center",
        justifyContent:"center", margin:"0 auto 16px",
        boxShadow:"0 6px 20px rgba(22,163,74,.3)" }}>
        <span style={{ color:"white", fontSize:"30px" }}>✓</span>
      </div>
      <h3 style={{ fontSize:"20px", fontWeight:900, color:"#166534", marginBottom:"8px" }}>
        تم استلام طلبك!
      </h3>
      <p style={{ color:"#15803d", fontSize:"14px", lineHeight:1.7, marginBottom:"16px" }}>
        سيتصل بك فريقنا للتأكيد وتحديد موعد التوصيل.
      </p>
      <p style={{ fontSize:"26px", fontWeight:900, color:"#16a34a" }}>
        {total.toFixed(0)} درهم
      </p>
      <p style={{ color:"#9ca3af", fontSize:"12px", marginTop:"4px" }}>
        الدفع عند الاستلام
      </p>
    </div>
  );

  const inp = (err:boolean): React.CSSProperties => ({
    display:"block", width:"100%", height:"48px",
    borderRadius:"12px", border:`2px solid ${err?"#f87171":"#e5e7eb"}`,
    background:"white", padding:"0 14px",
    fontSize:"16px", fontFamily:"'Cairo',sans-serif",
    boxSizing:"border-box", outline:"none", color:"#111827",
    WebkitAppearance:"none", appearance:"none",
  });
  const lbl: React.CSSProperties = {
    display:"block", fontSize:"13px", fontWeight:700,
    color:"#374151", marginBottom:"5px",
  };

  return (
    <form onSubmit={handleSubmit} style={F}>
      {/* Honeypot */}
      <input type="text" name="website" value={form.website}
        onChange={(e) => set("website",e.target.value)}
        style={{position:"absolute",left:"-9999px",opacity:0}}
        tabIndex={-1} aria-hidden="true" />

      {/* Bundle selector */}
      <div style={{ marginBottom:"18px" }}>
        <label style={lbl}>الكمية</label>
        <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
          {bundles.map((b) => (
            <button key={b.qty} type="button" onClick={() => setBundle(b.qty)}
              style={{
                display:"flex", justifyContent:"space-between", alignItems:"center",
                padding:"12px 14px", borderRadius:"12px",
                border:`2px solid ${bundle===b.qty?"#16a34a":"#e5e7eb"}`,
                background: bundle===b.qty?"#f0fdf4":"white",
                cursor:"pointer", fontFamily:"'Cairo',sans-serif",
              }}>
              <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                <div style={{
                  width:"18px", height:"18px", borderRadius:"50%",
                  border:`2px solid ${bundle===b.qty?"#16a34a":"#d1d5db"}`,
                  background: bundle===b.qty?"#16a34a":"transparent",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  flexShrink:0,
                }}>
                  {bundle===b.qty && (
                    <div style={{width:"8px",height:"8px",borderRadius:"50%",background:"white"}} />
                  )}
                </div>
                <span style={{fontSize:"14px",fontWeight:700,color:"#111827"}}>
                  {b.qty}× — {b.label}
                </span>
                {b.saving && (
                  <span style={{background:"#dcfce7",color:"#15803d",
                    fontSize:"11px",fontWeight:600,padding:"2px 8px",borderRadius:"9999px"}}>
                    {b.saving}
                  </span>
                )}
              </div>
              <span style={{fontSize:"17px",fontWeight:900,color:"#16a34a"}}>
                {b.price.toFixed(0)} درهم
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Fields */}
      {[
        {key:"customer_name",    label:"الاسم الكامل *",       type:"text", ph:"مثال: محمد الأحمدي"},
        {key:"customer_phone",   label:"رقم الهاتف *",          type:"tel",  ph:"0612345678"},
        {key:"customer_address", label:"العنوان التفصيلي *",    type:"text", ph:"الحي، الشارع..."},
      ].map(({key,label,type,ph}) => (
        <div key={key} style={{marginBottom:"14px"}}>
          <label style={lbl}>{label}</label>
          <input type={type} value={(form as Record<string,string>)[key]}
            onChange={(e) => set(key,e.target.value)}
            placeholder={ph} style={inp(!!errors[key])} required />
          {errors[key] && <p style={{color:"#ef4444",fontSize:"11px",marginTop:"3px"}}>{errors[key]}</p>}
        </div>
      ))}

      {/* City */}
      <div style={{marginBottom:"14px"}}>
        <label style={lbl}>المدينة *</label>
        <select value={form.customer_city}
          onChange={(e) => set("customer_city",e.target.value)}
          style={inp(!!errors.customer_city)} required>
          <option value="">اختر مدينتك</option>
          {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {errors.customer_city && <p style={{color:"#ef4444",fontSize:"11px",marginTop:"3px"}}>{errors.customer_city}</p>}
      </div>

      {/* Total */}
      <div style={{borderRadius:"12px",background:"#f0fdf4",
        border:"1px solid #bbf7d0",padding:"14px 16px",marginBottom:"18px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <p style={{fontSize:"13px",color:"#4b5563",fontWeight:600}}>المجموع</p>
          <span style={{fontSize:"26px",fontWeight:900,color:"#16a34a"}}>
            {total.toFixed(0)} <span style={{fontSize:"13px",color:"#6b7280"}}>درهم</span>
          </span>
        </div>
        <p style={{textAlign:"center",fontSize:"11px",color:"#15803d",
          fontWeight:600,marginTop:"6px"}}>
          الدفع عند الاستلام فقط
        </p>
      </div>

      {serverError && (
        <div style={{borderRadius:"12px",background:"#fef2f2",
          border:"1px solid #fecaca",padding:"12px",
          color:"#dc2626",fontSize:"13px",textAlign:"center",marginBottom:"14px"}}>
          {serverError}
        </div>
      )}

      <button type="submit" disabled={isPending}
        style={{display:"block",width:"100%",
          background:isPending?"#9ca3af":"#16a34a",
          color:"white",fontSize:"18px",fontWeight:800,
          padding:"16px 24px",borderRadius:"12px",
          border:"none",cursor:isPending?"not-allowed":"pointer",
          fontFamily:"'Cairo',sans-serif",boxSizing:"border-box",
          boxShadow:isPending?"none":"0 3px 16px rgba(22,163,74,.35)"}}>
        {isPending ? "جاري إرسال الطلب…" : `${ctaText} — ${total.toFixed(0)} درهم`}
      </button>

      <p style={{textAlign:"center",fontSize:"11px",color:"#9ca3af",marginTop:"10px"}}>
        بياناتك محفوظة وآمنة · الدفع عند الاستلام فقط
      </p>
    </form>
  );
}

const CITIES = ["الدار البيضاء","الرباط","مراكش","فاس","طنجة","أكادير","مكناس","وجدة",
  "القنيطرة","تطوان","سلا","الجديدة","خريبكة","بني ملال","تازة","الناظور","سطات",
  "آسفي","العرائش","الحسيمة","الرشيدية","ورزازات","إفران","زاكورة","طاطا","العيون","الداخلة",
  "مدينة أخرى"];
