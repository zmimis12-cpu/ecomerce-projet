"use client";
import { useState, useTransition, useRef } from "react";
import type { PublicProduct } from "@/lib/public/queries";
import { toInternationalMorocco } from "@/lib/delivery/phone-utils";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

interface Props {
  product: PublicProduct;
  productSlug: string;
  ctaText?: string;
  b1: number; b2: number; b3: number;
  cities?: string[];
  variants?: {name:string; options:string}[];
  pixelId?: string;
  tiktokPixelId?: string;
}

export function OrderFormPublic({ product, productSlug, ctaText = "اطلب الآن", b1, b2, b3, cities = FALLBACK_CITIES, variants = [], pixelId, tiktokPixelId }: Props) {
  const [isPending, startTransition] = useTransition();
  const [submitted, setSubmitted]    = useState(false);
  const [errors, setErrors]          = useState<Record<string, string>>({});
  const [serverError, setServerError]= useState("");
  const [citySearch, setCitySearch]  = useState("");
  const [selectedVariants, setSelectedVariants] = useState<Record<string,string>>({});
  const [cityOpen, setCityOpen]      = useState(false);
  const [bundle, setBundle]          = useState(1);
  const hasFiredInitiateCheckout = useRef(false);
  const [form, setForm] = useState({
    customer_name:"", customer_phone:"", customer_city:"",
    customer_address:"سيتم تأكيد العنوان عبر الهاتف", notes:"", website:"",
  });

  // InitiateCheckout — se déclenche une seule fois, à la première interaction
  // réelle avec le formulaire (pas au chargement de la page, ça c'est ViewContent).
  function trackInitiateCheckoutOnce() {
    if (hasFiredInitiateCheckout.current) return;
    hasFiredInitiateCheckout.current = true;
    if (typeof window === "undefined") return;
    const w = window as unknown as { fbq?: (...args: unknown[]) => void; ttq?: { track: (...args: unknown[]) => void } };
    w.fbq?.("track", "InitiateCheckout", { value: b1, currency: "MAD", content_name: product.name });
    w.ttq?.track("InitiateCheckout", { value: b1, currency: "MAD", content_id: product.id, content_name: product.name });
  }

  // Standard COD e-commerce bundle discounts: -10% for 2x, -20% for 3x
  // These match the server-side calculation in /api/public/orders so prices
  // are consistent between what the customer sees and what the order records.
  const unitPrice = b1; // sale_price_mad
  const bundles = [
    { qty:1, label:"1×", price: unitPrice,
      note:"قطعة واحدة" },
    { qty:2, label:"2×", price: b2 || Math.round(unitPrice * 2 * 0.90),
      note:`وفّر ${Math.round(unitPrice * 2 - (b2 || Math.round(unitPrice * 2 * 0.90)))} درهم`, pop:true },
    { qty:3, label:"3×", price: b3 || Math.round(unitPrice * 3 * 0.80),
      note:`وفّر ${Math.round(unitPrice * 3 - (b3 || Math.round(unitPrice * 3 * 0.80)))} درهم` },
  ];
  const total = bundles.find((b) => b.qty === bundle)?.price ?? unitPrice;

  function set(key: string, val: string) {
    if (key !== "website") trackInitiateCheckoutOnce(); // ignore le honeypot anti-bot
    setForm((f) => ({ ...f, [key]: val }));
    setErrors((e) => { const n={...e}; delete n[key]; return n; });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError("");
    // Validate city
    const newErrors: Record<string, string> = {};
    if (!form.customer_name.trim()) newErrors.customer_name = "الاسم مطلوب";
    if (!form.customer_phone.trim()) newErrors.customer_phone = "رقم الهاتف مطلوب";
    if (!form.customer_city.trim()) newErrors.customer_city = "المدينة مطلوبة";
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }

    startTransition(async () => {
      try {
        const res = await fetch("/api/public/orders", {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({
            ...form,
            quantity:     bundle,
            bundle_price: total,   // send the bundle total so API applies correct pricing
            variants:     selectedVariants,
            product_id:   product.id,
            product_slug: productSlug,
            meta_pixel_id: pixelId ?? null,
            meta_fbp: getCookie("_fbp"),
            meta_fbc: getCookie("_fbc"),
            tiktok_pixel_id: tiktokPixelId ?? null,
            tiktok_ttp: getCookie("_ttp"),
            tiktok_ttclid: new URLSearchParams(window.location.search).get("ttclid"),
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
            // Advanced matching — pixel.js hashes these client-side automatically.
            // Le téléphone doit être au format international (212XXXXXXXXX),
            // pas local (0XXXXXXXXX), sinon Meta ne peut pas matcher.
            const phone = toInternationalMorocco(form.customer_phone).replace("+", "");
            if (pixelId) {
              w.fbq?.("init", pixelId, {
                ph: phone,
                fn: form.customer_name.split(" ")[0] ?? "",
                ln: form.customer_name.split(" ").slice(1).join(" ") ?? "",
                ct: form.customer_city,
                country: "ma",
              });
            }
            w.fbq?.("track", "Lead", { value: total, currency: "MAD", content_name: product.name });

            const wt = window as unknown as { ttq?: { identify: (...args: unknown[]) => void; track: (...args: unknown[]) => void } };
            wt.ttq?.identify({ phone_number: toInternationalMorocco(form.customer_phone) });
            wt.ttq?.track("SubmitForm", { value: total, currency: "MAD", content_id: product.id, content_name: product.name });
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

      {/* Variants — only show if configured in LP builder */}
      {variants.length > 0 && variants.map((v, vi) => (
        <div key={vi} style={{marginBottom:"14px"}}>
          <label style={LBL}>{v.name} *</label>
          <div style={{display:"flex",flexWrap:"wrap",gap:"8px"}}>
            {v.options.split(",").map(opt => opt.trim()).filter(Boolean).map((opt, oi) => (
              <button
                key={oi}
                type="button"
                onClick={() => setSelectedVariants(prev => ({...prev, [v.name]: opt}))}
                style={{
                  padding:"8px 16px",borderRadius:"10px",border:"2px solid",
                  borderColor: selectedVariants[v.name] === opt ? "#16a34a" : "#e5e7eb",
                  background: selectedVariants[v.name] === opt ? "#f0fdf4" : "#fff",
                  color: selectedVariants[v.name] === opt ? "#16a34a" : "#374151",
                  fontWeight: selectedVariants[v.name] === opt ? 700 : 400,
                  fontSize:"14px",cursor:"pointer",
                  fontFamily:"var(--font-cairo),sans-serif",
                  transition:"all .15s",
                }}
              >{opt}</button>
            ))}
          </div>
        </div>
      ))}

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

      {/* Address field removed from UI (demandé — jugé trop long/difficile pour
          le client). On garde une valeur par défaut pour ne pas casser Digylog
          qui a besoin de ce champ pour générer le bon de livraison. */}

      {/* City — custom searchable dropdown */}
      <div style={{ marginBottom:"14px", position:"relative" }}>
        <label style={LBL}>المدينة *</label>
        <div
          onClick={() => setCityOpen(o => !o)}
          style={{...INP(!!errors.customer_city), display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer", height:"54px", padding:"0 14px"}}
        >
          <span style={{color: form.customer_city ? "#111827" : "#9ca3af"}}>
            {form.customer_city
              ? `${form.customer_city}${cityArabicLabel(form.customer_city) ? ` (${cityArabicLabel(form.customer_city)})` : ""}`
              : "اختر مدينتك"}
          </span>
          <span style={{fontSize:"12px", color:"#9ca3af"}}>▼</span>
        </div>
        {cityOpen && (
          <div style={{
            position:"absolute", top:"100%", left:0, right:0, zIndex:200,
            background:"#fff", border:"2px solid #16a34a", borderRadius:"12px",
            boxShadow:"0 8px 24px rgba(0,0,0,.15)", overflow:"hidden",
          }}>
            <div style={{padding:"8px"}}>
              <input
                type="text"
                value={citySearch}
                onChange={(e) => setCitySearch(e.target.value)}
                placeholder="ابحث عن مدينتك..."
                autoFocus
                style={{
                  width:"100%", height:"40px", border:"1px solid #e5e7eb",
                  borderRadius:"8px", padding:"0 12px", fontSize:"14px",
                  fontFamily:"var(--font-cairo),sans-serif", outline:"none",
                  boxSizing:"border-box",
                }}
              />
            </div>
            <div style={{maxHeight:"200px", overflowY:"auto"}}>
              {cities
                .filter(c => citySearchMatches(c, citySearch))
                .map(c => (
                  <div key={c}
                    onMouseDown={(e) => { e.preventDefault(); set("customer_city", c); setCityOpen(false); setCitySearch(""); }}
                    style={{
                      padding:"10px 16px", cursor:"pointer", fontSize:"14px",
                      fontFamily:"var(--font-cairo),sans-serif",
                      borderBottom:"1px solid #f3f4f6",
                      background: form.customer_city === c ? "#f0fdf4" : "#fff",
                      color: form.customer_city === c ? "#16a34a" : "#111",
                      fontWeight: form.customer_city === c ? 700 : 400,
                    }}
                  >{c}{cityArabicLabel(c) ? ` (${cityArabicLabel(c)})` : ""}</div>
                ))
              }
            </div>
          </div>
        )}
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
        {isPending ? "جاري إرسال الطلب…" : `${ctaText} — ${total.toFixed(0)} درهم`}
      </button>

      <p style={{ textAlign:"center", fontSize:"11px", color:"#9ca3af", marginTop:"10px" }}>
        بياناتك محفوظة وآمنة · الدفع عند الاستلام فقط
      </p>
    </form>
  );
}

// Affichage "Casablanca (الدار البيضاء)" pour que le client comprenne — la
// VALEUR réelle envoyée/stockée reste toujours le nom français seul (Digylog,
// sheets, etc. ne voient jamais l'arabe, juste l'affichage visuel change).
function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const CITY_FR_TO_AR: Record<string, string> = {
  "casablanca":"الدار البيضاء", "rabat":"الرباط", "marrakech":"مراكش",
  "fes":"فاس", "fez":"فاس", "tanger":"طنجة", "tangier":"طنجة",
  "agadir":"أكادير", "meknes":"مكناس", "oujda":"وجدة", "kenitra":"القنيطرة",
  "tetouan":"تطوان", "sale":"سلا", "el jadida":"الجديدة", "jadida":"الجديدة",
  "khouribga":"خريبكة", "beni mellal":"بني ملال", "taza":"تازة", "nador":"الناظور",
  "settat":"سطات", "safi":"آسفي", "larache":"العرائش", "hoceima":"الحسيمة",
  "al hoceima":"الحسيمة", "rachidia":"الرشيدية", "errachidia":"الرشيدية",
  "ouarzazate":"ورزازات", "ifrane":"إفران", "zagora":"زاكورة", "tata":"طاطا",
  "laayoune":"العيون", "layoune":"العيون", "dakhla":"الداخلة", "berrechid":"برشيد",
  "fquih ben salah":"الفقيه بن صالح", "fkih ben salah":"الفقيه بن صالح",
  "taroudant":"تارودانت", "tiflet":"تيفلت", "berkane":"بركان", "essaouira":"الصويرة",
  "chefchaouen":"شفشاون", "chaouen":"شفشاون", "midelt":"ميدلت",
  "kelaa des sraghna":"قلعة السراغنة", "kelaa sraghna":"قلعة السراغنة",
  "khenifra":"خنيفرة", "sidi kacem":"سيدي قاسم", "sidi slimane":"سيدي سليمان",
  "taounate":"تاونات", "mohammedia":"المحمدية", "temara":"تمارة",
  "khemisset":"الخميسات", "guelmim":"كلميم", "sefrou":"صفرو", "azrou":"أزرو",
  "ouezzane":"وزان", "ben guerir":"بن جرير", "youssoufia":"اليوسفية",
  "guercif":"جرسيف", "sidi bennour":"سيدي بنور", "boujdour":"بوجدور",
  "smara":"السمارة", "assa zag":"أسا زاك", "tan tan":"طانطان", "tantan":"طانطان",
  "azilal":"أزيلال", "demnate":"دمنات", "chichaoua":"شيشاوة", "el kelaa":"قلعة",
  "bouarfa":"بوعرفة", "figuig":"فجيج", "jerada":"جرادة", "taourirt":"تاوريرت",
  "ksar el kebir":"القصر الكبير", "asilah":"أصيلة", "martil":"مرتيل",
  "fnideq":"الفنيدق", "mdiq":"المضيق", "sidi ifni":"سيدي إفني",
  "moulay yacoub":"مولاي يعقوب", "ouislane":"ويسلان", "ain harrouda":"عين حرودة",
  "bouznika":"بوزنيقة", "skhirate":"الصخيرات", "had soualem":"حد السوالم",
  "driouch":"الدريوش", "imzouren":"إمزورن", "targuist":"تارجيست",
};

function cityArabicLabel(cityName: string): string | null {
  const norm = stripAccents(cityName.trim().toLowerCase());
  for (const [fr, ar] of Object.entries(CITY_FR_TO_AR)) {
    if (norm.includes(fr)) return ar;
  }
  return null;
}

// Recherche en arabe sur des villes affichées en français (Digylog) — ne
// change JAMAIS ce qui est affiché/stocké/envoyé à Digylog ou aux sheets,
// sert UNIQUEMENT à faire matcher la saisie arabe du client avec la bonne ville.
const CITY_AR_TO_FR: Record<string, string> = {
  "الدار البيضاء":"casablanca", "كازا":"casablanca", "كازابلانكا":"casablanca",
  "الرباط":"rabat", "مراكش":"marrakech", "فاس":"fes fez", "طنجة":"tanger tangier",
  "أكادير":"agadir", "مكناس":"meknes", "وجدة":"oujda", "القنيطرة":"kenitra",
  "تطوان":"tetouan", "سلا":"sale", "الجديدة":"jadida", "خريبكة":"khouribga",
  "بني ملال":"beni mellal", "تازة":"taza", "الناظور":"nador", "سطات":"settat",
  "آسفي":"safi", "العرائش":"larache", "الحسيمة":"hoceima", "الرشيدية":"rachidia errachidia",
  "ورزازات":"ouarzazate", "إفران":"ifrane", "زاكورة":"zagora", "طاطا":"tata",
  "العيون":"laayoune", "الداخلة":"dakhla", "برشيد":"berrechid", "الفقيه بن صالح":"fquih ben saleh",
  "تارودانت":"taroudant", "تيفلت":"tiflet", "بركان":"berkane", "الصويرة":"essaouira",
  "شفشاون":"chefchaouen", "ميدلت":"midelt", "قلعة السراغنة":"kelaa sraghna", "خنيفرة":"khenifra",
  "سيدي قاسم":"sidi kacem", "سيدي سليمان":"sidi slimane", "تاونات":"taounate",
};

function citySearchMatches(cityName: string, query: string): boolean {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  const cityNorm = stripAccents(cityName.toLowerCase());
  if (cityNorm.includes(stripAccents(q)) || cityName.includes(query)) return true;
  // Si la recherche contient de l'arabe, on la traduit et compare au nom français
  for (const [ar, fr] of Object.entries(CITY_AR_TO_FR)) {
    if (ar.includes(q) || q.includes(ar)) {
      if (fr.split(" ").some((token) => cityName.toLowerCase().includes(token))) return true;
    }
  }
  return false;
}

export const FALLBACK_CITIES = [
  "الدار البيضاء","الرباط","مراكش","فاس","طنجة","أكادير","مكناس","وجدة",
  "القنيطرة","تطوان","سلا","الجديدة","خريبكة","بني ملال","تازة","الناظور",
  "سطات","آسفي","العرائش","الحسيمة","الرشيدية","ورزازات","إفران","زاكورة",
  "طاطا","العيون","الداخلة","مدينة أخرى",
];
