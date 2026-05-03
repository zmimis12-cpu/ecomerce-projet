/**
 * Public route group layout.
 * Fully isolated from admin — no sidebar, no auth.
 * Includes critical mobile viewport meta tag.
 */
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  robots: { index: true, follow: false },
};

// Critical: without this, mobile browsers zoom out and show desktop layout
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ margin: 0, padding: 0, overflowX: "hidden" }}>
        {children}
      </body>
    </html>
  );
}
