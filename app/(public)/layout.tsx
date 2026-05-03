/**
 * Public route group layout.
 * IMPORTANT: Route group layouts nest INSIDE the root layout.
 * Do NOT include <html> or <body> tags here — they already exist in app/layout.tsx.
 * This layout only adds viewport + font for public pages.
 */
import type { Viewport } from "next";
import type { ReactNode } from "react";

export const viewport: Viewport = {
  width:        "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function PublicLayout({ children }: { children: ReactNode }) {
  // No html/body — root layout provides those.
  // Just pass children through; viewport meta is added via the export above.
  return <>{children}</>;
}
