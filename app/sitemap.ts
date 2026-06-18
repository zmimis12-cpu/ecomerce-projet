import type { MetadataRoute } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";

const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://ecomerce-projet.vercel.app").replace(/\/$/, "");

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { data: pages } = await supabaseAdmin
    .from("landing_pages")
    .select("slug, updated_at")
    .eq("is_active", true);

  const entries: MetadataRoute.Sitemap = ((pages ?? []) as { slug: string; updated_at: string }[]).map((p) => ({
    url: `${SITE_URL}/lp/${p.slug}`,
    lastModified: p.updated_at ? new Date(p.updated_at) : new Date(),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return entries;
}
