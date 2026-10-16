"use client";
/** Bloc Speedaf sur la fiche commande : envoyer · étiquette · annuler. */
import { useEffect, useState, useTransition } from "react";
import { Truck, FileDown, XCircle } from "lucide-react";
import {
  sendOrderToSpeedaf, previewSpeedafCity, listSpeedafCityNames, getSpeedafLabels, cancelSpeedafOrder,
} from "@/lib/delivery/speedaf/actions";

function downloadPdf(b64: string, name: string) {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([buf], { type: "application/pdf" }));
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  URL.revokeObjectURL(url);
}

export function SpeedafOrderActions({ orderId, canSend, isSpeedaf, tracking }: {
  orderId: string; canSend: boolean; isSpeedaf: boolean; tracking: string | null;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [preview, setPreview] = useState<{ city: string; resolved: string | null; suggestions: string[] } | null>(null);
  const [allCities, setAllCities] = useState<string[]>([]);
  const [pick, setPick] = useState("");

  useEffect(() => {
    if (!canSend) return;
    previewSpeedafCity(orderId).then((p) => { setPreview(p); if (!p.resolved) setPick(p.suggestions[0] ?? ""); }).catch(() => {});
  }, [canSend, orderId]);

  function send() {
    setMsg(null);
    start(async () => {
      const r = await sendOrderToSpeedaf(orderId, preview?.resolved ? undefined : pick || undefined);
      if (r.success) setMsg({ ok: true, text: `✓ Envoyé chez Speedaf — ${r.tracking}` });
      else {
        setMsg({ ok: false, text: r.error ?? "Erreur" });
        if (r.needCity) {
          setPreview((p) => p ? { ...p, resolved: null, suggestions: r.suggestions ?? [] } : p);
          setPick(r.suggestions?.[0] ?? "");
        }
      }
    });
  }

  if (!canSend && !isSpeedaf) return null;

  return (
    <div className="space-y-2 rounded-lg border border-orange-200 bg-orange-50/60 p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-orange-800"><Truck className="h-3.5 w-3.5" /> Speedaf</p>

      {canSend && (
        <>
          {preview && (
            preview.resolved
              ? <p className="text-xs text-muted-foreground">Ville : <b>{preview.city}</b> → Speedaf <b>{preview.resolved}</b></p>
              : (
                <div className="space-y-1">
                  <p className="text-xs text-orange-800">Ville « {preview.city} » non reconnue — choisis la ville Speedaf :</p>
                  <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={pick}
                    onFocus={() => { if (!allCities.length) listSpeedafCityNames().then(setAllCities).catch(() => {}); }}
                    onChange={(e) => setPick(e.target.value)}>
                    {preview.suggestions.map((c) => <option key={`s-${c}`} value={c}>⭐ {c}</option>)}
                    {allCities.filter((c) => !preview.suggestions.includes(c)).map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <p className="text-[11px] text-muted-foreground">Le choix est mémorisé pour les prochaines commandes de cette ville.</p>
                </div>
              )
          )}
          <button type="button" onClick={send} disabled={pending || (!!preview && !preview.resolved && !pick)}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50">
            <Truck className="h-4 w-4" /> {pending ? "Envoi…" : "Envoyer via Speedaf"}
          </button>
        </>
      )}

      {isSpeedaf && tracking && (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending}
            onClick={() => start(async () => {
              const r = await getSpeedafLabels([tracking]);
              if (r.ok && r.blobBase64) downloadPdf(r.blobBase64, `speedaf-${tracking}.pdf`);
              else setMsg({ ok: false, text: r.error ?? "Erreur étiquette" });
            })}
            className="flex items-center gap-1 rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50">
            <FileDown className="h-3.5 w-3.5" /> Étiquette Speedaf
          </button>
          <button type="button" disabled={pending}
            onClick={() => {
              if (!confirm("Annuler l'envoi chez Speedaf ? (possible seulement avant le ramassage)")) return;
              start(async () => {
                const r = await cancelSpeedafOrder(orderId);
                setMsg(r.success ? { ok: true, text: "✓ Envoi annulé — la commande est de nouveau « confirmée »." } : { ok: false, text: r.error ?? "Erreur" });
              });
            }}
            className="flex items-center gap-1 rounded-md border border-red-200 bg-background px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">
            <XCircle className="h-3.5 w-3.5" /> Annuler l&apos;envoi
          </button>
        </div>
      )}

      {msg && <p className={`text-xs font-medium ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</p>}
    </div>
  );
}
