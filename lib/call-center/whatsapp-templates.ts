/**
 * Messages WhatsApp manuels du call center (bouton → ouvre WhatsApp avec le texte prêt).
 * Modifiables depuis l'admin (app_settings « cc_whatsapp_templates »). Utilisable client + serveur.
 * Variables : {name} {product} {total} {city} {address} {order} {tracking}
 */
export type CcWaKey = "new_order" | "no_answer" | "confirm" | "shipped";
export type CcWaTemplates = Record<CcWaKey, string>;

export const CC_WA_LABEL: Record<CcWaKey, string> = {
  new_order: "Nouvelle commande (demander confirmation)",
  no_answer: "Pas de réponse",
  confirm: "Commande confirmée",
  shipped: "Expédition",
};

export const CC_WA_DEFAULTS: CcWaTemplates = {
  new_order:
    "السلام عليكم {name} 🌸\nمعاك HajtekZone، توصلنا بالطلب ديالك 🙏\n📦 {product}\n💰 المجموع: {total} درهم — الدفع عند الاستلام\n📍 {city}\n\nواش نأكدو ليك الطلب ونصيفطوه؟ جاوبنا بكلمة « مؤكد » ✅\nوإلا بغيتي تبدل شي حاجة (العنوان ولا الكمية) كتب لينا هنا 👇",
  no_answer:
    "السلام عليكم {name} 🌸\nعيطنا ليك باش نأكدو الطلب ديالك ديال {product} وما جاوبتيش 📞\nإلا كنتي مازال بغيتيه، جاوبنا هنا بكلمة « مؤكد » ✅ ولا قول لينا وقتاش نعيطو ليك.",
  confirm:
    "السلام عليكم {name} 🌸\nالطلب ديالك تأكد ✅\n📦 {product}\n💰 المجموع: {total} درهم — الدفع عند الاستلام\n📍 {city}\nغادي نصيفطوه ليك فأقرب وقت 🚚 شكراً على الثقة 🙏",
  shipped:
    "السلام عليكم {name} 🌸\nالكولية ديالك ({product}) خرجات ودابا فالطريق 🚚\n🔎 رقم التتبع: {tracking}\nالموزع غادي يعيط ليك قبل ما يوصل، عافاك خلي التيليفون مشعول 📞",
};

export function normalizeCcWa(v: unknown): CcWaTemplates {
  const o = (v && typeof v === "object" ? v : {}) as Partial<CcWaTemplates>;
  const pick = (k: CcWaKey) => (typeof o[k] === "string" && o[k]!.trim() ? o[k]! : CC_WA_DEFAULTS[k]);
  return { new_order: pick("new_order"), no_answer: pick("no_answer"), confirm: pick("confirm"), shipped: pick("shipped") };
}

export function fillCcWa(tpl: string, vars: Record<string, string | number | null | undefined>): string {
  // une ligne dont toutes les variables sont vides disparaît (ex. pas de numéro de suivi)
  return tpl.split("\n").flatMap((line) => {
    const out = line.replace(/\{(\w+)\}/g, (_, k) => (vars[k] == null ? "" : String(vars[k])));
    return /\{\w+\}/.test(line) && !/\{\w+\}/.test(out) && line.match(/\{(\w+)\}/g)!.every((m) => !vars[m.slice(1, -1)]) ? [] : [out];
  }).join("\n");
}

/** wa.me veut 212XXXXXXXXX (sans +, sans 0) */
export function waLink(phone: string, text: string): string {
  let d = (phone || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = "212" + d.slice(1);
  else if (!d.startsWith("212")) d = "212" + d;
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}
