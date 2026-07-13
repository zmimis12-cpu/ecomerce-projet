"use client";

import { useState, useTransition } from "react";
import { saveWhatsAppSettings, testWhatsAppMessage } from "@/lib/whatsapp/actions";

interface Props {
  initial: {
    access_token: string;
    phone_number_id: string;
    is_active: boolean;
    message_template: string;
  } | null;
}

export function WhatsAppSettingsForm({ initial }: Props) {
  const [accessToken, setAccessToken] = useState(initial?.access_token ?? "");
  const [phoneNumberId, setPhoneNumberId] = useState(initial?.phone_number_id ?? "");
  const [isActive, setIsActive] = useState(initial?.is_active ?? false);
  const [template, setTemplate] = useState(initial?.message_template ??
    "السلام عليكم {name} 🌸\nتوصلنا بالطلب ديالك ديال {product} بثمن {price}درهم.\nبغينا غير نأكدو معاك المعلومات:\n📍 المدينة: {city}\n🏠 العنوان: {address}\nواش هاد المعلومات صحيحة؟");
  const [testPhone, setTestPhone] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setMessage(null);
    startTransition(async () => {
      const res = await saveWhatsAppSettings({
        access_token: accessToken, phone_number_id: phoneNumberId,
        is_active: isActive, message_template: template,
      });
      setMessage(res.success ? { type: "success", text: "Réglages enregistrés." } : { type: "error", text: res.error ?? "Erreur." });
    });
  }

  function runTest() {
    setMessage(null);
    startTransition(async () => {
      const res = await testWhatsAppMessage(testPhone);
      setMessage(res.success ? { type: "success", text: "Message test envoyé ✅" } : { type: "error", text: res.error ?? "Échec." });
    });
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold">Connexion Meta WhatsApp Cloud API</h3>
        <p className="text-xs text-muted-foreground">
          Meta for Developers → Ton app → WhatsApp → API Setup. Copie le <strong>Temporary/System User Access Token</strong> et le <strong>Phone Number ID</strong>.
        </p>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Access Token</label>
          <input type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)}
            placeholder="EAAxxxxxxxxxxxxx"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-mono" />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Phone Number ID</label>
          <input value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)}
            placeholder="123456789012345"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-mono" />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Activer l&apos;envoi automatique à la création de commande
        </label>

        <button type="button" onClick={save} disabled={isPending}
          className="rounded-md bg-black text-white px-3 py-2 text-sm font-medium disabled:opacity-50">
          Enregistrer
        </button>
      </div>

      <div className="rounded-xl border bg-card p-5 space-y-3">
        <h3 className="text-sm font-semibold">Template du message (Darija)</h3>
        <p className="text-xs text-muted-foreground">
          Variables disponibles : <code>{"{name}"}</code> <code>{"{product}"}</code> <code>{"{price}"}</code> <code>{"{city}"}</code> <code>{"{address}"}</code>
        </p>
        <textarea value={template} onChange={(e) => setTemplate(e.target.value)} rows={7} dir="rtl"
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-sans" />
        <button type="button" onClick={save} disabled={isPending}
          className="rounded-md bg-black text-white px-3 py-2 text-sm font-medium disabled:opacity-50">
          Enregistrer le template
        </button>
      </div>

      <div className="rounded-xl border bg-card p-5 space-y-3">
        <h3 className="text-sm font-semibold">Tester la connexion</h3>
        <div className="flex gap-2">
          <input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="0612345678"
            className="flex h-9 rounded-md border border-input bg-background px-3 text-sm" />
          <button type="button" onClick={runTest} disabled={isPending || !testPhone}
            className="rounded-md bg-secondary px-3 py-2 text-sm font-medium hover:bg-secondary/80 disabled:opacity-50">
            Envoyer un test
          </button>
        </div>
      </div>

      {message && (
        <p className={`text-sm rounded-md px-3 py-2 ${message.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
