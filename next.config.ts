import type { NextConfig } from "next";

// R2_PUBLIC_URL peut être un domaine custom (ex: cdn.hajtek.ma) ou un
// sous-domaine *.r2.dev — on extrait le hostname pour l'autoriser dans
// next/image sans bloquer le build si la variable n'est pas encore définie.
let r2Hostname: string | null = null;
try {
  if (process.env.R2_PUBLIC_URL) r2Hostname = new URL(process.env.R2_PUBLIC_URL).hostname;
} catch { /* ignore malformed URL at build time */ }

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      // Anciennes images pas encore migrées vers R2 restent servies depuis Supabase.
      ...(r2Hostname ? [{ protocol: "https" as const, hostname: r2Hostname }] : []),
      { protocol: "https" as const, hostname: "*.r2.dev" },
    ],
    // Filenames are unique (timestamp+random), content never changes for a given URL
    // → cache 1 an côté Vercel pour arrêter de re-fetch en boucle.
    minimumCacheTTL: 31536000,
  },
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000", process.env.NEXT_PUBLIC_APP_URL ?? ""],
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
