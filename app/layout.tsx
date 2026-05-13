import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "GestionPro",
    template: "%s | GestionPro",
  },
  description: "E-commerce Operations Management System",
  robots: { index: false, follow: false },
};

// Viewport is defined here at root — applies to all routes
export const viewport: Viewport = {
  width:        "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body style={{ overflowX: "hidden", fontFamily: "system-ui, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
