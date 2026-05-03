"use client";
import { useState, useTransition } from "react";
import { generateWithAI } from "@/lib/landing-pages/actions";
import type { TemplateKey } from "@/lib/templates";
import type { GeneratedContent } from "@/lib/ai/generator";
import { Sparkles } from "lucide-react";

interface AIGenerateButtonProps {
  productId: string;
  templateKey: TemplateKey;
  onGenerated: (content: GeneratedContent) => void;
}

export function AIGenerateButton({ productId, templateKey, onGenerated }: AIGenerateButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError]            = useState<string | null>(null);

  function handleGenerate() {
    if (!productId) { setError("Sélectionnez d'abord un produit."); return; }
    setError(null);
    startTransition(async () => {
      const res = await generateWithAI(productId, templateKey);
      if (res.success && res.content) {
        onGenerated(res.content);
      } else {
        setError(res.error ?? "Erreur de génération.");
      }
    });
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="button"
        onClick={handleGenerate}
        disabled={isPending || !productId}
        className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white px-5 py-2.5 text-sm font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-violet-200"
      >
        <Sparkles className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
        {isPending ? "Génération en cours…" : "✨ Générer avec l'IA"}
      </button>
      <p className="text-xs text-muted-foreground">
        {process.env.NEXT_PUBLIC_AI_CONFIGURED === "true"
          ? "Connecté à l'IA"
          : "Mode mock — configurez AI_PROVIDER dans Vercel pour l'IA réelle"}
      </p>
    </div>
  );
}
