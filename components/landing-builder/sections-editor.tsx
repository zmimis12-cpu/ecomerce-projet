"use client";
import { useState } from "react";
import type { LPSection } from "@/lib/templates";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Eye, EyeOff } from "lucide-react";
import { SectionImagePicker } from "./section-image-picker";

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

    case "problem_solution": {
      const beforePoints = (section.before_points as string[]) ?? [];
      const afterPoints  = (section.after_points as string[]) ?? [];
      const setPoint = (key: "before_points" | "after_points", list: string[], i: number, val: string) => {
        const updated = list.map((p, j) => (j === i ? val : p));
        onField(idx, key, updated);
      };
      return (
        <div className="space-y-3">
          {ta("before_title", "عنوان قبل (المشكلة)")}
          <SectionImagePicker value={section.before_image as string | undefined}
            onChange={(url) => onField(idx, "before_image", url)} label="صورة المشكلة (قبل)" />
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">نقاط المشكل (✕)</p>
            {beforePoints.map((p, i) => (
              <input key={i} value={p}
                onChange={(e) => setPoint("before_points", beforePoints, i, e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" dir="auto" />
            ))}
          </div>
          {ta("after_title", "عنوان بعد (الحل)")}
          <SectionImagePicker value={section.after_image as string | undefined}
            onChange={(url) => onField(idx, "after_image", url)} label="صورة الحل (بعد)" />
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">نقاط الحل (✓)</p>
            {afterPoints.map((p, i) => (
              <input key={i} value={p}
                onChange={(e) => setPoint("after_points", afterPoints, i, e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" dir="auto" />
            ))}
          </div>
        </div>
      );
    }

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
      const addItem = () => onField(idx, "items", [...items, { name: "", city: "", text: "" }]);
      const removeItem = (i: number) => onField(idx, "items", items.filter((_, j) => j !== i));
      return (
        <div className="space-y-3">
          {items.map((item, i) => (
            <div key={i} className="rounded-lg bg-secondary/20 p-3 space-y-2 relative">
              <button type="button" onClick={() => removeItem(i)}
                className="absolute top-2 left-2 text-red-500 hover:text-red-700 text-xs">✕</button>
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
          <button type="button" onClick={addItem}
            className="w-full rounded-md border border-dashed border-gray-300 py-2 text-xs text-muted-foreground hover:border-gray-400">
            + Ajouter un avis
          </button>
        </div>
      );
    }

    case "faq": {
      const items = (section.items as { q: string; a: string }[]) ?? [];
      const addItem = () => onField(idx, "items", [...items, { q: "", a: "" }]);
      const removeItem = (i: number) => onField(idx, "items", items.filter((_, j) => j !== i));
      return (
        <div className="space-y-3">
          {items.map((item, i) => (
            <div key={i} className="space-y-1 relative pl-4">
              <button type="button" onClick={() => removeItem(i)}
                className="absolute top-0 left-0 text-red-500 hover:text-red-700 text-xs">✕</button>
              <input value={item.q} onChange={(e) => onListItem(idx, "items", i, "q", e.target.value)}
                placeholder="Question" className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs" dir="auto" />
              <textarea value={item.a} onChange={(e) => onListItem(idx, "items", i, "a", e.target.value)}
                placeholder="Réponse" rows={2}
                className="flex w-full rounded-md border border-input bg-background px-2 py-1 text-xs resize-none" dir="auto" />
            </div>
          ))}
          <button type="button" onClick={addItem}
            className="w-full rounded-md border border-dashed border-gray-300 py-2 text-xs text-muted-foreground hover:border-gray-400">
            + Ajouter une question
          </button>
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

    case "how_to_use": {
      const steps = (section.steps as { number: number; title: string; desc: string }[]) ?? [];
      return (
        <div className="space-y-3">
          {ta("title", "عنوان القسم")}
          {steps.map((s, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 items-start rounded-lg bg-secondary/20 p-2">
              <input value={s.title} onChange={(e) => onListItem(idx, "steps", i, "title", e.target.value)}
                placeholder={`عنوان الخطوة ${s.number}`} className="h-9 rounded-md border border-input bg-background px-2 text-sm" dir="auto" />
              <input value={s.desc} onChange={(e) => onListItem(idx, "steps", i, "desc", e.target.value)}
                placeholder="الوصف" className="h-9 rounded-md border border-input bg-background px-2 text-sm" dir="auto" />
              <div className="col-span-2">
                <SectionImagePicker value={(s as unknown as { image_url?: string }).image_url}
                  onChange={(url) => onListItem(idx, "steps", i, "image_url", url)} label={`صورة/GIF للخطوة ${s.number}`} />
              </div>
            </div>
          ))}
        </div>
      );
    }

    case "guarantees": {
      const items = (section.items as { icon: string; title: string; desc: string }[]) ?? [];
      return (
        <div className="space-y-3">
          {ta("title", "عنوان القسم")}
          {items.map((item, i) => (
            <div key={i} className="grid grid-cols-3 gap-2 items-start">
              <input value={item.icon} onChange={(e) => onListItem(idx, "items", i, "icon", e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-center text-lg" />
              <input value={item.title} onChange={(e) => onListItem(idx, "items", i, "title", e.target.value)}
                placeholder="عنوان" className="h-9 rounded-md border border-input bg-background px-2 text-sm" dir="auto" />
              <input value={item.desc} onChange={(e) => onListItem(idx, "items", i, "desc", e.target.value)}
                placeholder="وصف" className="h-9 rounded-md border border-input bg-background px-2 text-sm" dir="auto" />
            </div>
          ))}
        </div>
      );
    }

    case "stats_bar": {
      const items = (section.items as { percent: string; label: string }[]) ?? [];
      return (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">أرقام الثقة ({items.length})</p>
          {items.map((item, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 items-start">
              <input value={item.percent} onChange={(e) => onListItem(idx, "items", i, "percent", e.target.value)}
                placeholder="98%" className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
              <input value={item.label} onChange={(e) => onListItem(idx, "items", i, "label", e.target.value)}
                placeholder="وصف الرقم" className="h-9 rounded-md border border-input bg-background px-2 text-sm" dir="auto" />
            </div>
          ))}
        </div>
      );
    }

    case "suitable_for": {
      const items = (section.items as { icon: string; label: string }[]) ?? [];
      return (
        <div className="space-y-3">
          {ta("title", "عنوان القسم")}
          {items.map((item, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 items-start">
              <input value={item.icon} onChange={(e) => onListItem(idx, "items", i, "icon", e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-center text-lg" />
              <input value={item.label} onChange={(e) => onListItem(idx, "items", i, "label", e.target.value)}
                placeholder="الفئة المستهدفة" className="h-9 rounded-md border border-input bg-background px-2 text-sm" dir="auto" />
            </div>
          ))}
        </div>
      );
    }

    case "comparison_table": {
      const rows = (section.rows as { feature: string; ours: boolean; theirs: boolean }[]) ?? [];
      return (
        <div className="space-y-3">
          {ta("title", "عنوان القسم")}
          {ta("ours_label", "تسمية منتجنا")}
          {ta("theirs_label", "تسمية الحلول العادية")}
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={r.feature} onChange={(e) => onListItem(idx, "rows", i, "feature", e.target.value)}
                placeholder="الميزة" className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm" dir="auto" />
              <label className="flex items-center gap-1 text-xs">
                <input type="checkbox" checked={r.ours} onChange={(e) => onListItem(idx, "rows", i, "ours", e.target.checked as never)} /> نحن
              </label>
              <label className="flex items-center gap-1 text-xs">
                <input type="checkbox" checked={r.theirs} onChange={(e) => onListItem(idx, "rows", i, "theirs", e.target.checked as never)} /> عادي
              </label>
            </div>
          ))}
        </div>
      );
    }

    default:
      return <p className="text-xs text-muted-foreground">Section auto-générée.</p>;
  }
}
