"use client";
import { useState, useTransition } from "react";
import type { PublicProduct } from "@/lib/public/queries";
import { cn } from "@/lib/utils";

interface OrderFormProps {
  product: PublicProduct;
  productSlug: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
          body: JSON.stringify({ ...form, product_id: product.id, product_slug: productSlug }),
        });
        const data = await res.json() as { success: boolean; orderNumber?: string; errors?: Record<string, string>; error?: string };
        if (data.success) { setSubmitted(true); window.scrollTo({ top: 0, behavior: "smooth" }); }
        else if (data.errors) setErrors(data.errors);
        else setServerError(data.error ?? "حدث خطأ. يرجى المحاولة مجدداً.");
      } catch { setServerError("خطأ في الاتصال. حاول مجدداً."); }
    });
  }

  if (submitted) {
    return (
      <div className="rounded-3xl bg-gradient-to-b from-green-50 to-emerald-50 border-2 border-green-200 p-8 text-center space-y-5">
        <div className="w-20 h-20 rounded-full bg-green-600 flex items-center justify-center mx-auto shadow-lg shadow-green-200">
          <span className="text-white text-4xl">✓</span>
        </div>
        <div>
          <h3 className="text-2xl font-black text-green-900 mb-2">تم استلام طلبك! 🎉</h3>
          <p className="text-green-700 text-base leading-relaxed">
            سيتصل بك فريقنا خلال ساعات لتأكيد الطلب وتحديد موعد التوصيل.
          </p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-green-100">
          <p className="text-sm text-gray-600">سعر الطلب</p>
          <p className="text-3xl font-black text-green-600">{total.toFixed(0)} درهم</p>
          <p className="text-xs text-gray-400 mt-1">الدفع عند الاستلام فقط</p>
        </div>
        <p className="text-sm text-gray-500">شكراً لثقتك بنا ❤️</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} dir="rtl" className="space-y-4">
      {/* Hidden honeypot */}
      <input type="text" name="website" value={form.website}
        onChange={(e) => set("website", e.target.value)}
        style={{ position: "absolute", left: "-9999px", opacity: 0 }}
        tabIndex={-1} aria-hidden="true" />

      {/* Name */}
      <div className="space-y-1.5">
        <label className="block text-sm font-bold text-gray-700">الاسم الكامل *</label>
        <input type="text" value={form.customer_name}
          onChange={(e) => set("customer_name", e.target.value)}
          placeholder="مثال: محمد الأحمدي"
          className={inputCls(!!errors.customer_name)} required />
        {errors.customer_name && <p className="text-xs text-red-600">{errors.customer_name}</p>}
      </div>

      {/* Phone */}
      <div className="space-y-1.5">
        <label className="block text-sm font-bold text-gray-700">رقم الهاتف *</label>
        <input type="tel" value={form.customer_phone}
          onChange={(e) => set("customer_phone", e.target.value)}
          placeholder="0612345678"
          className={inputCls(!!errors.customer_phone)} required />
        {errors.customer_phone && <p className="text-xs text-red-600">{errors.customer_phone}</p>}
      </div>

      {/* City */}
      <div className="space-y-1.5">
        <label className="block text-sm font-bold text-gray-700">المدينة *</label>
        <select value={form.customer_city}
          onChange={(e) => set("customer_city", e.target.value)}
          className={inputCls(!!errors.customer_city)} required>
          <option value="">اختر مدينتك</option>
          {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {errors.customer_city && <p className="text-xs text-red-600">{errors.customer_city}</p>}
      </div>

      {/* Address */}
      <div className="space-y-1.5">
        <label className="block text-sm font-bold text-gray-700">العنوان التفصيلي *</label>
        <input type="text" value={form.customer_address}
          onChange={(e) => set("customer_address", e.target.value)}
          placeholder="الحي، الشارع، رقم البناية..."
          className={inputCls(!!errors.customer_address)} required />
        {errors.customer_address && <p className="text-xs text-red-600">{errors.customer_address}</p>}
      </div>

      {/* Quantity */}
      <div className="space-y-1.5">
        <label className="block text-sm font-bold text-gray-700">الكمية</label>
        <div className="flex items-center gap-4 bg-gray-50 rounded-2xl p-3 border border-gray-200">
          <button type="button" onClick={() => set("quantity", Math.max(1, form.quantity - 1))}
            className="h-10 w-10 rounded-xl bg-white border-2 border-gray-200 text-xl font-bold flex items-center justify-center hover:border-green-400 transition-colors">−</button>
          <span className="text-2xl font-black text-gray-900 flex-1 text-center">{form.quantity}</span>
          <button type="button" onClick={() => set("quantity", Math.min(10, form.quantity + 1))}
            className="h-10 w-10 rounded-xl bg-white border-2 border-gray-200 text-xl font-bold flex items-center justify-center hover:border-green-400 transition-colors">+</button>
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <label className="block text-sm font-bold text-gray-700">ملاحظات (اختياري)</label>
        <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)}
          placeholder="أي تعليمات إضافية..." rows={2}
          className="flex w-full rounded-2xl border-2 border-gray-200 bg-white px-4 py-3 text-base placeholder:text-gray-400 focus:outline-none focus:border-green-500 resize-none" />
      </div>

      {/* Total summary */}
      <div className="rounded-2xl bg-green-50 border-2 border-green-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600 font-medium">إجمالي طلبك</p>
            <p className="text-xs text-gray-400">{form.quantity} × {product.sale_price_mad.toFixed(0)} درهم</p>
          </div>
          <div className="text-left">
            <p className="text-3xl font-black text-green-600">{total.toFixed(0)}</p>
            <p className="text-sm font-bold text-gray-500">درهم</p>
          </div>
        </div>
        <p className="text-xs text-green-700 font-semibold mt-2 text-center">✓ الدفع عند الاستلام — ما فيه مخاطرة</p>
      </div>

      {serverError && (
        <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 text-center">
          {serverError}
        </div>
      )}

      <button type="submit" disabled={isPending}
        className={cn(
          "w-full rounded-2xl py-5 text-xl font-black text-white transition-all active:scale-[0.98]",
          "shimmer cta-pulse",
          "disabled:opacity-60 disabled:cursor-not-allowed disabled:animate-none"
        )}>
        {isPending ? "⏳ جاري إرسال الطلب..." : `🛒 أكد الطلب — ${total.toFixed(0)} درهم`}
      </button>

      <p className="text-center text-xs text-gray-400">
        🔒 بياناتك محفوظة وآمنة تماماً | الدفع عند الاستلام فقط
      </p>
    </form>
  );
}

const inputCls = (hasError: boolean) => cn(
  "flex h-13 w-full rounded-2xl border-2 bg-white px-4 py-3.5 text-base",
  "placeholder:text-gray-400 focus:outline-none transition-colors",
  hasError ? "border-red-400 focus:border-red-500" : "border-gray-200 focus:border-green-500"
);

const CITIES = [
  "الدار البيضاء","الرباط","مراكش","فاس","طنجة","أكادير","مكناس","وجدة",
  "القنيطرة","تطوان","سلا","الجديدة","خريبكة","بني ملال","تازة","الناظور",
  "سطات","آسفي","العرائش","الحسيمة","الرشيدية","ورزازات","إفران","زاكورة",
  "طاطا","العيون","الداخلة","مدينة أخرى",
];
