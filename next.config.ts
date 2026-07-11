import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
    // Filenames are unique (timestamp+random), content never changes for a given URL
    // → cache 1 an côté Vercel pour arrêter de re-fetch Supabase Storage à chaque requête.
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
