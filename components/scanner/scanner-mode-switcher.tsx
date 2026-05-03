"use client";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Barcode, RotateCcw } from "lucide-react";

export function ScannerModeSwitcher({ currentMode }: { currentMode: "exit" | "return" }) {
  const router = useRouter();

  function switchMode(mode: "exit" | "return") {
    if (mode === currentMode) return;
    // prefetch + instant navigation — no Link component delay
    router.push(`/admin/scanner?mode=${mode}`);
  }

  return (
    <div className="flex rounded-xl border bg-secondary/30 p-1 gap-1">
      <button
        type="button"
        onClick={() => switchMode("exit")}
        className={cn(
          "flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all",
          currentMode === "exit"
            ? "bg-indigo-600 text-white shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Barcode className="h-4 w-4" /> Sortie
      </button>
      <button
        type="button"
        onClick={() => switchMode("return")}
        className={cn(
          "flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all",
          currentMode === "return"
            ? "bg-amber-600 text-white shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <RotateCcw className="h-4 w-4" /> Retour
      </button>
    </div>
  );
}
