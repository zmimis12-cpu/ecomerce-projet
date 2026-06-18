import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Public landing pages (/lp/*) are entirely in Arabic — the <html> tag must
  // reflect that for SEO and accessibility. Next.js doesn't support a second
  // <html> per route group, so we read the pathname (forwarded by middleware)
  // and set lang/dir dynamically here instead.
  const pathname = (await headers()).get("x-pathname") ?? "";
  const isLandingPage = pathname.startsWith("/lp");

  return (
    <html lang={isLandingPage ? "ar" : "fr"} dir={isLandingPage ? "rtl" : "ltr"} suppressHydrationWarning>
      <body className={inter.className} style={{ overflowX: "hidden" }}>
        {children}
      </body>
    </html>
  );
}
