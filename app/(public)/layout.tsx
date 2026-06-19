/**
 * Public route group layout.
 * IMPORTANT: Route group layouts nest INSIDE the root layout.
 * Do NOT include <html> or <body> tags here — they already exist in app/layout.tsx.
 * This layout adds viewport + the Cairo font (Arabic + Latin) for public pages.
 */
import type { Viewport } from "next";
import type { ReactNode } from "react";
import { Cairo } from "next/font/google";

export const viewport: Viewport = {
  width:        "device-width",
  initialScale: 1,
  maximumScale: 5,
};

// Cairo supports Arabic natively and renders far better than the system
// font fallback that was silently happening before (font-family: 'Cairo'
// was referenced everywhere in these pages but never actually loaded).
const cairo = Cairo({
  subsets:    ["arabic", "latin"],
  weight:     ["400", "500", "600", "700", "800", "900"],
  variable:   "--font-cairo",
  display:    "swap",
});

export default function PublicLayout({ children }: { children: ReactNode }) {
  // No html/body — root layout provides those. We inject the font variable
  // + a font-family override scoped to this subtree via a wrapper div,
  // since we can't reach the <body> tag from a nested route group layout.
  return (
    <div className={cairo.variable} style={{ fontFamily: "var(--font-cairo), sans-serif", width: "100%", overflowX: "hidden" }}>
      {children}
    </div>
  );
}
