import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

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
      <body className={inter.className} style={{ overflowX: "hidden" }}>
        {children}
      </body>
    </html>
  );
}
