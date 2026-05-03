/**
 * Public route group layout.
 * Completely isolated — no admin sidebar, no auth, no Inter font override.
 * Wraps: /lp/[slug]
 */
import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: true, follow: false },
};

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, padding: 0 }}>
        {children}
      </body>
    </html>
  );
}
