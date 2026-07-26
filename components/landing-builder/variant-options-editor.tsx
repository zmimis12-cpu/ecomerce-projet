"use client";

import { useState } from "react";
import { Plus, X, Upload } from "lucide-react";
import { SectionImagePicker } from "@/components/landing-builder/section-image-picker";

export interface VariantOption { label: string; image?: string }
export interface VariantGroup { name: string; options: VariantOption[] }

interface Props {
  value: VariantGroup[];
  onChange: (v: VariantGroup[]) => void;
}

/** Éditeur de variantes (taille/couleur) — chaque option peut avoir une image
 * (utile pour les couleurs). Le choix du client sera écrit automatiquement
 * dans les notes de la commande (visibles dans Google Sheets / Digylog). */
export function VariantOptionsEditor({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);

  function addGroup() {
    onChange([...value, { name: "", options: [{ label: "" }] }]);
  }
  function removeGroup(gi: number) {
    onChange(value.filter((_, i) => i !== gi));
  }
  function updateGroupName(gi: number, name: string) {
    onChange(value.map((g, i) => (i === gi ? { ...g, name } : g)));
  }
  function addOption(gi: number) {
    onChange(value.map((g, i) => (i === gi ? { ...g, options: [...g.options, { label: "" }] } : g)));
  }
  function updateOption(gi: number, oi: number, patch: Partial<VariantOption>) {
    onChange(value.map((g, i) =>
      i === gi ? { ...g, options: g.options.map((o, j) => (j === oi ? { ...o, ...patch } : o)) } : g
    ));
  }
  function removeOption(gi: number, oi: number) {
    onChange(value.map((g, i) =>
      i === gi ? { ...g, options: g.options.filter((_, j) => j !== oi) } : g
    ));
  }

  if (!open && value.length === 0) {
    return (
      <button type="button" onClick={() => { setOpen(true); addGroup(); }}
        className="flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-sm font-medium hover:bg-secondary/80">
        <Plus className="h-4 w-4" /> Ajouter des variantes (taille/couleur)
      </button>
    );
  }

  return (
    <div className="space-y-4">
      {value.map((group, gi) => (
        <div key={gi} className="rounded-lg border p-3 space-y-2">
          <div className="flex items-center gap-2">
            <input value={group.name} onChange={(e) => updateGroupName(gi, e.target.value)}
              placeholder="اسم الاختيار (مثلاً: الحجم أو اللون)"
              className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm" dir="auto" />
            <button type="button" onClick={() => removeGroup(gi)} className="text-red-500 hover:text-red-700">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-2 pr-4">
            {group.options.map((opt, oi) => (
              <div key={oi} className="flex items-start gap-2 rounded-md bg-secondary/20 p-2">
                <input value={opt.label} onChange={(e) => updateOption(gi, oi, { label: e.target.value })}
                  placeholder="مثلاً: أحمر أو M"
                  className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs" dir="auto" />
                <SectionImagePicker value={opt.image} onChange={(url) => updateOption(gi, oi, { image: url })} label="" />
                <button type="button" onClick={() => removeOption(gi, oi)} className="text-red-500 hover:text-red-700 mt-1.5">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <button type="button" onClick={() => addOption(gi)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <Plus className="h-3 w-3" /> إضافة اختيار
            </button>
          </div>
        </div>
      ))}
      <button type="button" onClick={addGroup}
        className="flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground hover:border-gray-400">
        <Upload className="h-3.5 w-3.5" /> إضافة نوع اختيار آخر (مثلاً الحجم بعد اللون)
      </button>
    </div>
  );
}
