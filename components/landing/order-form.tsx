"use client";
import { useState, useTransition } from "react";
import type { PublicProduct } from "@/lib/public/queries";
import { cn } from "@/lib/utils";

interface OrderFormProps {
  product: PublicProduct;
  productSlug: string;
}

interface FormState {
  customer_name:    string;
  customer_phone:   string;
  customer_city:    string;
  customer_address: string;
  quantity:         number;
  notes:            string;
  website:          string; // honeypot
}

export function OrderForm({ product, productSlug }: OrderFormProps) { // eslint-disable-line
  const [isPending, startTransition] = useTransition();
  const [submitted, setSubmitted]    = useState(false);
  const [orderNum, setOrderNum]      = useState("");
  const [errors, setErrors]          = useState<Record<string, string>>({});
  const [serverError, setServerError]= useState("");

  const [form, setForm] = useState<FormState>({
    customer_name:    "",
    customer_phone:   "",
    customer_city:    "",
    customer_address: "",
    quantity:         1,
    notes:            "",
    website:          "",
  });

  const total = product.sale_price_mad * form.quantity;

  function set(key: keyof FormState, value: string | number) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => { const n = { ...e }; delete n[key]; return n; });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError("");

    startTransition(async () => {
      try {
        const res = await fetch("/api/public/orders", {
          method:  "POST",
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
          setOrderNum(data.orderNumber ?? "");
          setSubmitted(true);
          window.scrollTo({ top: 0, behavior: "smooth" });
        } else if (data.errors) {
          setErrors(data.errors);
        } else {
          setServerError(data.error ?? "حدث خطأ. يرجى المحاولة مجدداً.");
        }
      } catch {
        setServerError("حدث خطأ في الاتصال. تحقق من الإنترنت وحاول مجدداً.");
      }
    });
  }

  if (submitted) {
    return (
      <div className="rounded-2xl bg-green-50 border-2 border-green-200 p-8 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center mx-auto">
          <span className="text-white text-3xl">✓</span>
        </div>
        <h3 className="text-xl font-bold text-green-900">تم استلام طلبك بنجاح!</h3>
        <p className="text-green-700 text-base leading-relaxed">
          سيتصل بك فريقنا قريباً لتأكيد الطلب وتحديد موعد التوصيل.
        </p>
        {orderNum && (
          <p className="text-sm text-green-600 font-mono">رقم الطلب: {orderNum}</p>
        )}
        <p className="text-sm text-green-600">شكراً لثقتك بنا 🙏</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" dir="rtl">
      <h3 className="text-xl font-bold text-center text-gray-800 mb-5">
        اطلب الآن — الدفع عند الاستلام 💚
      </h3>

      {/* Honeypot — hidden from humans */}
      <input
        type="text" name="website" value={form.website}
        onChange={(e) => set("website", e.target.value)}
        tabIndex={-1} aria-hidden="true"
        style={{ position: "absolute", left: "-9999px", opacity: 0 }}
      />

      <Field label="الاسم الكامل *" error={errors.customer_name}>
        <input type="text" value={form.customer_name}
          onChange={(e) => set("customer_name", e.target.value)}
          placeholder="مثال: محمد الأحمدي"
          className={inputCls(!!errors.customer_name)} required />
      </Field>

      <Field label="رقم الهاتف *" error={errors.customer_phone}>
        <input type="tel" value={form.customer_phone}
          onChange={(e) => set("customer_phone", e.target.value)}
          placeholder="0612345678"
          className={inputCls(!!errors.customer_phone)} required />
      </Field>

      <Field label="المدينة *" error={errors.customer_city}>
        <select value={form.customer_city}
          onChange={(e) => set("customer_city", e.target.value)}
          className={inputCls(!!errors.customer_city)} required>
          <option value="">اختر مدينتك</option>
          {MOROCCAN_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>

      <Field label="العنوان التفصيلي *" error={errors.customer_address}>
        <input type="text" value={form.customer_address}
          onChange={(e) => set("customer_address", e.target.value)}
          placeholder="الحي، الشارع، رقم البناية..."
          className={inputCls(!!errors.customer_address)} required />
      </Field>

      <Field label="الكمية" error={errors.quantity}>
        <div className="flex items-center gap-3">
          <button type="button"
            onClick={() => set("quantity", Math.max(1, form.quantity - 1))}
            className="h-11 w-11 rounded-xl border-2 text-xl font-bold flex items-center justify-center hover:bg-gray-50 transition-colors">
            −
          </button>
          <span className="text-2xl font-bold w-10 text-center">{form.quantity}</span>
          <button type="button"
            onClick={() => set("quantity", Math.min(10, form.quantity + 1))}
            className="h-11 w-11 rounded-xl border-2 text-xl font-bold flex items-center justify-center hover:bg-gray-50 transition-colors">
            +
          </button>
        </div>
      </Field>

      <Field label="ملاحظات (اختياري)">
        <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)}
          placeholder="أي تعليمات إضافية للتوصيل..."
          rows={2} className="flex w-full rounded-xl border-2 border-gray-200 bg-white px-4 py-3 text-base placeholder:text-gray-400 focus:outline-none focus:border-green-500 resize-none" />
      </Field>

      {/* Total */}
      <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 flex items-center justify-between">
        <span className="text-gray-600">المجموع</span>
        <span className="text-2xl font-bold text-green-600">
          {total.toFixed(2)} درهم
        </span>
      </div>

      {serverError && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 text-center">
          {serverError}
        </div>
      )}

      {/* Submit */}
      <button type="submit" disabled={isPending}
        className={cn(
          "w-full rounded-2xl py-5 text-xl font-bold text-white transition-all",
          "bg-green-600 hover:bg-green-700 active:scale-[0.98]",
          "disabled:opacity-60 disabled:cursor-not-allowed",
          "shadow-lg shadow-green-200"
        )}>
        {isPending ? "جاري الإرسال..." : `🛒 اطلب الآن — ${total.toFixed(0)} درهم`}
      </button>

      <p className="text-center text-sm text-gray-500">
        🔒 معلوماتك محفوظة وآمنة | الدفع عند الاستلام فقط
      </p>
    </form>
  );
}

function inputCls(hasError: boolean) {
  return cn(
    "flex h-12 w-full rounded-xl border-2 bg-white px-4 text-base",
    "placeholder:text-gray-400 focus:outline-none transition-colors",
    hasError ? "border-red-400 focus:border-red-500" : "border-gray-200 focus:border-green-500"
  );
}

function Field({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-gray-700">{label}</label>
      {children}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

const MOROCCAN_CITIES = [
  "الدار البيضاء","الرباط","مراكش","فاس","طنجة","أكادير","مكناس","وجدة","القنيطرة",
  "تطوان","سلا","الجديدة","خريبكة","بني ملال","تازة","الناظور","سطات","آسفي",
  "العرائش","الحسيمة","الرشيدية","ورزازات","إفران","زاكورة","طاطا","العيون","الداخلة",
  "مدينة أخرى",
];
