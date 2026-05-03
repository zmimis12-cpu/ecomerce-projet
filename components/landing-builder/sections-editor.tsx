"use client";
import { useState } from "react";
import type { LPSection } from "@/lib/templates";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Eye, EyeOff } from "lucide-react";

interface SectionsEditorProps {
  sections: LPSection[];
  onChange: (sections: LPSection[]) => void;
}

const SECTION_LABELS: Record<string, string> = {
  hero:             "🖼️ Hero — Image + Headline",
  problem_solution: "💡 Problème / Solution",
  gallery:          "📸 Galerie photos",
  benefits:         "✅ Avantages produit",
  reviews:          "⭐ Avis clients",
  faq:              "❓ FAQ",
  order_form:       "📋 Formulaire de commande",
};

export function SectionsEditor({ sections, onChange }: SectionsEditorProps) {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  function toggleSection(idx: number) {
    const updated = sections.map((s, i) =>
      i === idx ? { ...s, enabled: !s.enabled } : s
    );
    onChange(updated);
  }

  function updateField(idx: number, key: string, value: unknown) {
    const updated = sections.map((s, i) =>
      i === idx ? { ...s, [key]: value } : s
    );
    onChange(updated);
  }

  function updateListItem(idx: number, listKey: string, itemIdx: number, field: string, value: string) {
    const section = sections[idx];
    const list    = (section[listKey] as Record<string, string>[]) ?? [];
    const updated = list.map((item, i) =>
      i === itemIdx ? { ...item, [field]: value } : item
    );
    updateField(idx, listKey, updated);
  }

  return (
    <div className="space-y-2">
      {sections.map((section, idx) => (
        <div key={idx} className={cn(
          "rounded-xl border overflow-hidden",
          section.enabled ? "border-border" : "border-dashed border-muted opacity-60"
        )}>
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-secondary/20">
            <button type="button" onClick={() => toggleSection(idx)}
              className="text-muted-foreground hover:text-foreground transition-colors">
              {section.enabled
                ? <Eye className="h-4 w-4 text-green-600" />
                : <EyeOff className="h-4 w-4" />}
            </button>
            <span className="text-sm font-medium flex-1">
              {SECTION_LABELS[section.type] ?? section.type}
            </span>
            <button type="button" onClick={() => setOpenIdx(openIdx === idx ? null : idx)}
              className="text-muted-foreground hover:text-foreground">
              {openIdx === idx ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>

          {/* Content editor */}
          {openIdx === idx && section.enabled && (
            <div className="px-4 py-4 space-y-3 bg-card">
              <SectionFields section={section} idx={idx}
                onField={updateField} onListItem={updateListItem} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SectionFields({ section, idx, onField, onListItem }: {
  section: LPSection; idx: number;
  onField: (idx: number, key: string, value: unknown) => void;
  onListItem: (idx: number, listKey: string, itemIdx: number, field: string, value: string) => void;
}) {
  const ta = (key: string, placeholder: string, rows = 2) => (
    <div key={key} className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{key}</label>
      <textarea
        value={String(section[key] ?? "")}
        onChange={(e) => onField(idx, key, e.target.value)}
        placeholder={placeholder} rows={rows}
        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        dir="auto"
      />
    </div>
  );

  switch (section.type) {
    case "hero":
      return (
        <div className="space-y-3">
          {ta("headline",    "العنوان الرئيسي بالعربية")}
          {ta("subheadline", "العنوان الفرعي")}
        </div>
      );

    case "problem_solution":
      return (
        <div className="space-y-3">
          {ta("before_title", "عنوان قبل (المشكلة)")}
          {ta("after_title",  "عنوان بعد (الحل)")}
        </div>
      );

    case "benefits": {
      const items = (section.items as { icon: string; title: string; desc: string }[]) ?? [];
      return (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Modifiez les avantages ({items.length})</p>
          {items.map((item, i) => (
            <div key={i} className="grid grid-cols-3 gap-2 items-start">
              <input value={item.icon}  onChange={(e) => onListItem(idx, "items", i, "icon",  e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-center text-lg" />
              <input value={item.title} onChange={(e) => onListItem(idx, "items", i, "title", e.target.value)}
                placeholder="Titre" className="h-9 rounded-md border border-input bg-background px-2 text-sm" dir="auto" />
              <input value={item.desc}  onChange={(e) => onListItem(idx, "items", i, "desc",  e.target.value)}
                placeholder="Description" className="h-9 rounded-md border border-input bg-background px-2 text-sm" dir="auto" />
            </div>
          ))}
        </div>
      );
    }

    case "reviews": {
      const items = (section.items as { name: string; city: string; text: string }[]) ?? [];
      return (
        <div className="space-y-3">
          {items.map((item, i) => (
            <div key={i} className="rounded-lg bg-secondary/20 p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input value={item.name} onChange={(e) => onListItem(idx, "items", i, "name", e.target.value)}
                  placeholder="Nom client" className="h-8 rounded-md border border-input bg-background px-2 text-xs" dir="auto" />
                <input value={item.city} onChange={(e) => onListItem(idx, "items", i, "city", e.target.value)}
                  placeholder="Ville" className="h-8 rounded-md border border-input bg-background px-2 text-xs" dir="auto" />
              </div>
              <textarea value={item.text} onChange={(e) => onListItem(idx, "items", i, "text", e.target.value)}
                placeholder="Texte de l'avis" rows={2}
                className="flex w-full rounded-md border border-input bg-background px-2 py-1 text-xs resize-none" dir="auto" />
            </div>
          ))}
        </div>
      );
    }

    case "faq": {
      const items = (section.items as { q: string; a: string }[]) ?? [];
      return (
        <div className="space-y-3">
          {items.map((item, i) => (
            <div key={i} className="space-y-1">
              <input value={item.q} onChange={(e) => onListItem(idx, "items", i, "q", e.target.value)}
                placeholder="Question" className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs" dir="auto" />
              <textarea value={item.a} onChange={(e) => onListItem(idx, "items", i, "a", e.target.value)}
                placeholder="Réponse" rows={2}
                className="flex w-full rounded-md border border-input bg-background px-2 py-1 text-xs resize-none" dir="auto" />
            </div>
          ))}
        </div>
      );
    }

    case "order_form":
      return (
        <div className="space-y-3">
          {ta("headline", "عنوان نموذج الطلب")}
          {ta("sub",      "النص تحت العنوان")}
        </div>
      );

    default:
      return <p className="text-xs text-muted-foreground">Section auto-générée.</p>;
  }
}
