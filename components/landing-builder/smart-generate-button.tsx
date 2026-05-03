"use client";
import { useState, useTransition } from "react";
import { smartGenerateLandingPage } from "@/lib/landing-pages/actions";
import type { GeneratedContent } from "@/lib/ai/generator";
import { Sparkles, Zap } from "lucide-react";

interface SmartGenerateButtonProps {
  productId: string;
  onGenerated: (content: GeneratedContent, templateKey: string) => void;
}

export function SmartGenerateButton({ productId, onGenerated }: SmartGenerateButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [status,   setStatus]        = useState<string | null>(null);
  const [error,    setError]         = useState<string | null>(null);

  function handleGenerate() {
    if (!productId) { setError("Sélectionnez d'abord un produit."); return; }
    setError(null);
    setStatus("🔍 Analyse du produit…");

    startTransition(async () => {
      setStatus("🧠 Sélection du template…");
      const res = await smartGenerateLandingPage(productId);

      if (res.success && res.content) {
        setStatus(`✅ Template: ${res.templateKey} — Contenu généré!`);
        onGenerated(res.content, res.templateKey ?? "gadget_viral");
        setTimeout(() => setStatus(null), 3000);
      } else {
        setError(res.error ?? "Erreur.");
        setStatus(null);
      }
    });
  }

  return (
    <div className="space-y-3">
      {/* Main smart button */}
      <button
        type="button"
        onClick={handleGenerate}
        disabled={isPending || !productId}
        className="w-full flex items-center justify-center gap-2.5 rounded-xl py-4 text-base font-bold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: isPending
            ? "#6b7280"
            : "linear-gradient(135deg, #7c3aed 0%, #4f46e5 50%, #2563eb 100%)",
          boxShadow: isPending ? "none" : "0 4px 20px rgba(124,58,237,0.4)",
        }}
      >
        {isPending ? (
          <><Sparkles className="h-5 w-5 animate-spin" /> Génération en cours…</>
        ) : (
          <><Zap className="h-5 w-5" /> ✨ Générer avec l&apos;IA — Auto-Detect</>
        )}
      </button>

      {/* Status / progress */}
      {status && (
        <div className="flex items-center gap-2 rounded-lg bg-violet-50 border border-violet-200 px-4 py-2.5 text-sm text-violet-700 font-medium">
          <Sparkles className="h-4 w-4 animate-pulse shrink-0" />
          {status}
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 font-medium">{error}</p>
      )}

      <p className="text-xs text-muted-foreground text-center">
        Analyse automatique du produit → sélection du template → génération du contenu arabe
      </p>
    </div>
  );
}
