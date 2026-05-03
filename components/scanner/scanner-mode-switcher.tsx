"use client";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Barcode, RotateCcw } from "lucide-react";

export function ScannerModeSwitcher({ currentMode }: { currentMode: "exit" | "return" }) {
  return (
    <div className="flex rounded-xl border bg-secondary/30 p-1 gap-1">
      <Link href="/admin/scanner?mode=exit" className={cn(
        "flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all",
        currentMode === "exit"
          ? "bg-indigo-600 text-white shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      )}>
        <Barcode className="h-4 w-4" /> Sortie
      </Link>
      <Link href="/admin/scanner?mode=return" className={cn(
        "flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all",
        currentMode === "return"
          ? "bg-amber-600 text-white shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      )}>
        <RotateCcw className="h-4 w-4" /> Retour
      </Link>
    </div>
  );
}
