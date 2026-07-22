"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import type { LPSection } from "@/lib/templates";

interface Props {
  sections: LPSection[];
  onImport: (sections: LPSection[]) => void;
}

/**
 * Colle un JSON (généré par Claude ou écrit à la main) contenant le contenu
 * de plusieurs sections d'un coup — évite de copier-coller champ par champ
 * dans chaque section une par une.
 *
 * Format attendu: un objet { "type_de_section": { ...champs... }, ... }
 * Exemple:
 * {
 *   "problem_solution": { "before_title": "...", "before_points": ["...","..."] },
 *   "benefits": { "items": [{ "icon":"✅","title":"...","desc":"..." }] }
 * }
 */
export function SectionsImporter({ sections, onImport }: Props) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function handleImport() {
    setError(null);
    setSuccess(null);
    let parsed: Record<string, Record<string, unknown>>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      setError("JSON invalide — vérifie qu'il n'y a pas de virgule en trop ou de guillemet manquant.");
      return;
    }

    const typesFound = Object.keys(parsed);
    if (typesFound.length === 0) {
      setError("Aucune section trouvée dans ce JSON.");
      return;
    }

    const updated = sections.map((section) => {
      const patch = parsed[section.type];
      if (!patch) return section;
      return { ...section, ...patch, type: section.type, enabled: section.enabled };
    });

    onImport(updated);
    setSuccess(`${typesFound.length} section(s) importée(s): ${typesFound.join(", ")}. N'oublie pas de cliquer "Enregistrer" en haut.`);
    setRaw("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 mb-3 rounded-lg bg-emerald-50 text-emerald-700 px-3 py-1.5 text-xs font-medium hover:bg-emerald-100">
        <Upload className="h-3.5 w-3.5" /> Importer le contenu en 1 clic (coller du JSON)
      </button>
    );
  }

  return (
    <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-2">
      <p className="text-xs text-muted-foreground">
        Colle ici le JSON du contenu (généré par Claude ou écrit à la main) — chaque section correspondante sera remplie automatiquement.
      </p>
      <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={8}
        placeholder='{"problem_solution": {"before_title": "...", ...}, "benefits": {...}}'
        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs font-mono" dir="ltr" />
      {error && <p className="text-xs text-red-600 bg-red-50 rounded-md px-2 py-1.5">{error}</p>}
      {success && <p className="text-xs text-emerald-700 bg-emerald-50 rounded-md px-2 py-1.5">{success}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={handleImport} disabled={!raw.trim()}
          className="rounded-md bg-black text-white px-3 py-1.5 text-xs font-medium disabled:opacity-50">
          Importer
        </button>
        <button type="button" onClick={() => { setOpen(false); setError(null); }}
          className="rounded-md px-3 py-1.5 text-xs font-medium hover:bg-secondary/80">
          Annuler
        </button>
      </div>
    </div>
  );
}
