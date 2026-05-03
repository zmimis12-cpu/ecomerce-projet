"use client";
/**
 * Client component that builds the LP URL using window.location.origin
 * as fallback when NEXT_PUBLIC_APP_URL is not set.
 * This ensures we NEVER show a Supabase JWT in the URL.
 */
import { useMemo } from "react";
import { CopyUrlButton } from "./copy-url-button";
import { ExternalLink } from "lucide-react";

interface Props {
  slug: string;
  /** URL from server env — may be empty string if NEXT_PUBLIC_APP_URL not set */
  url: string | null;
}

export function LandingPageUrlClient({ slug, url: serverUrl }: Props) {
  // Build final URL — prefer server-provided URL, fallback to window.location.origin
  const url = useMemo(() => {
    if (serverUrl) return serverUrl;
    if (typeof window !== "undefined") {
      return `${window.location.origin}/lp/${slug}`;
    }
    return `/lp/${slug}`;
  }, [serverUrl, slug]);

  return (
    <div className="flex items-center gap-3 rounded-xl border bg-blue-50 border-blue-200 px-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-blue-700 mb-0.5">Page de vente publique</p>
        <p className="text-xs font-mono text-blue-600 truncate">{url}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <CopyUrlButton url={url} />
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors">
          <ExternalLink className="h-3 w-3" /> Ouvrir
        </a>
      </div>
    </div>
  );
}
