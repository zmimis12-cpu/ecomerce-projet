"use client";
import { useState } from "react";
import { Copy, Check } from "lucide-react";

export function CopyUrlButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button type="button" onClick={handleCopy}
      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors">
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copié!" : "Copier"}
    </button>
  );
}
