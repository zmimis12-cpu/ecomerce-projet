"use client";
import { useState, useMemo } from "react";
import { Copy, Check } from "lucide-react";

interface CopyUrlButtonProps {
  url: string;
  /** If true, prepend window.location.origin to relative URLs */
  computeFromOrigin?: boolean;
}

export function CopyUrlButton({ url, computeFromOrigin }: CopyUrlButtonProps) {
  const [copied, setCopied] = useState(false);

  const fullUrl = useMemo(() => {
    if (!computeFromOrigin) return url;
    if (typeof window === "undefined") return url;
    // If url is relative (starts with /), prepend origin
    if (url.startsWith("/")) return `${window.location.origin}${url}`;
    return url;
  }, [url, computeFromOrigin]);

  function handleCopy() {
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button type="button" onClick={handleCopy}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      title="Copier l'URL">
      {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copié!" : "Copier"}
    </button>
  );
}
