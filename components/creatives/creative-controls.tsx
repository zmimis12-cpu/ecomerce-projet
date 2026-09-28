"use client";
import { useState, useTransition } from "react";
import { Copy, Check, Plus, Trash2 } from "lucide-react";
import {
  createCreative, updateCreativeStatus, updateEditorCommission, updateCreativeEditor, deleteCreative,
} from "@/lib/creatives/actions";

const INPUT = "h-9 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30";
const BTN = "inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50";

export function CreateCreativeForm({
  editors, products,
}: {
  editors: { id: string; name: string }[];
  products: { id: string; name: string }[];
}) {
  const [editorId, setEditorId] = useState("");
  const [productId, setProductId] = useState("");
  const [title, setTitle] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [platform, setPlatform] = useState<"meta" | "tiktok" | "other">("meta");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setMsg(null);
    start(async () => {
      const r = await createCreative({ editorId, productId: productId || null, title, videoUrl, platform });
      if (r.success) {
        setMsg({ ok: true, text: `Vidéo créée avec le code ${r.code} — copie son lien pub dans le tableau.` });
        setTitle(""); setVideoUrl("");
      } else {
        setMsg({ ok: false, text: r.error ?? "Erreur" });
      }
    });
  }

  if (editors.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucun éditeur. Crée d&apos;abord un compte dans Paramètres → Utilisateurs avec le rôle <b>Éditeur Vidéo</b>.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <select className={INPUT} value={editorId} onChange={(e) => setEditorId(e.target.value)}>
          <option value="">Éditeur…</option>
          {editors.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <select className={INPUT} value={productId} onChange={(e) => setProductId(e.target.value)}>
          <option value="">Produit…</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input className={INPUT} placeholder="Titre (ex: Hook témoignage)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className={INPUT} placeholder="Lien vidéo (Drive…) optionnel" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />
        <select className={INPUT} value={platform} onChange={(e) => setPlatform(e.target.value as typeof platform)}>
          <option value="meta">Meta (FB/Insta)</option>
          <option value="tiktok">TikTok</option>
          <option value="other">Autre</option>
        </select>
      </div>
      <div className="flex items-center gap-3">
        <button className={BTN} disabled={pending} onClick={submit}>
          <Plus className="h-4 w-4" /> {pending ? "Création…" : "Ajouter la vidéo"}
        </button>
        {msg && <span className={msg.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"}>{msg.text}</span>}
      </div>
    </div>
  );
}

export function CreativeStatusSelect({ id, status }: { id: string; status: "draft" | "in_ads" | "paused" }) {
  const [value, setValue] = useState(status);
  const [pending, start] = useTransition();
  return (
    <select
      className={INPUT + " h-8 text-xs"}
      value={value}
      disabled={pending}
      onChange={(e) => {
        const v = e.target.value as typeof status;
        setValue(v);
        start(async () => { await updateCreativeStatus(id, v); });
      }}
    >
      <option value="in_ads">🟢 En pub</option>
      <option value="paused">⏸️ En pause</option>
      <option value="draft">📝 Brouillon</option>
    </select>
  );
}

export function CopyLinkButton({ link }: { link: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!link) return <span className="text-xs text-muted-foreground">Pas de LP pour ce produit</span>;
  return (
    <button
      type="button"
      title={link}
      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
      onClick={async () => {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copié" : "Lien pub"}
    </button>
  );
}

export function EditorCommissionForm({
  userId, type, value,
}: { userId: string; type: "fixed" | "percent"; value: number }) {
  const [t, setT] = useState(type);
  const [v, setV] = useState(String(value));
  const [state, setState] = useState<"" | "saved" | "error">("");
  const [pending, start] = useTransition();
  const dirty = t !== type || Number(v) !== value;

  return (
    <div className="flex items-center gap-1.5">
      <input
        className={INPUT + " h-8 w-20 text-xs"}
        type="number" min={0} step="0.5" value={v}
        onChange={(e) => { setV(e.target.value); setState(""); }}
      />
      <select className={INPUT + " h-8 text-xs"} value={t} onChange={(e) => { setT(e.target.value as typeof t); setState(""); }}>
        <option value="fixed">MAD / livrée</option>
        <option value="percent">% du montant</option>
      </select>
      {dirty && (
        <button
          className="h-8 rounded-md bg-primary px-2 text-xs text-primary-foreground disabled:opacity-50"
          disabled={pending}
          onClick={() => start(async () => {
            const r = await updateEditorCommission(userId, t, Number(v));
            setState(r.success ? "saved" : "error");
          })}
        >
          OK
        </button>
      )}
      {state === "saved" && <Check className="h-4 w-4 text-emerald-600" />}
      {state === "error" && <span className="text-xs text-red-600">Erreur</span>}
    </div>
  );
}

export function CreativeEditorSelect({
  id, editorId, editors,
}: { id: string; editorId: string; editors: { id: string; name: string }[] }) {
  const [value, setValue] = useState(editorId);
  const [pending, start] = useTransition();
  return (
    <select
      className={INPUT + " h-8 text-xs"}
      value={value}
      disabled={pending}
      onChange={(e) => {
        const v = e.target.value;
        const prev = value;
        if (!confirm("Changer l'éditeur de cette vidéo ? Les gains de ses commandes iront au nouvel éditeur.")) return;
        setValue(v);
        start(async () => {
          const r = await updateCreativeEditor(id, v);
          if (!r.success) { setValue(prev); alert(r.error); }
        });
      }}
    >
      {editors.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
    </select>
  );
}

export function DeleteCreativeButton({ id, code }: { id: string; code: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      title="Supprimer"
      disabled={pending}
      className="inline-flex items-center rounded-md border px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
      onClick={() => {
        if (!confirm(`Supprimer la vidéo ${code} ?`)) return;
        start(async () => {
          const r = await deleteCreative(id);
          if (!r.success) alert(r.error);
        });
      }}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}
