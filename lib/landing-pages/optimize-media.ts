/**
 * lib/landing-pages/optimize-media.ts — allège automatiquement les images des
 * landing pages (server-only, sharp) :
 *   • PNG / JPG / WEBP → WebP, largeur max 1080 px, qualité 80
 *   • GIF animé → WebP ANIMÉ (même animation), largeur max 720 px
 * Un GIF de 15 Mo devient ~1 Mo → la page s'ouvre vite sur la 4G.
 */
import sharp from "sharp";
import { supabaseAdmin } from "@/lib/supabase/admin";

const MIN_BYTES = 300_000; // en dessous : déjà assez léger

export async function optimizeImageBuffer(input: Buffer, contentType: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  const isGif = contentType === "image/gif";
  if (!/^image\/(png|jpe?g|webp|gif)$/.test(contentType)) return null;
  if (input.length < MIN_BYTES) return null;
  try {
    // WebP/PNG animé : on ne l'aplatit jamais en une seule image
    if (!isGif) {
      const md = await sharp(input, { limitInputPixels: false }).metadata();
      if ((md.pages ?? 1) > 1) return null;
    }
    const out = isGif
      ? await sharp(input, { animated: true, limitInputPixels: false })
          .resize({ width: 720, withoutEnlargement: true })
          .webp({ quality: 60, effort: 4, loop: 0 })
          .toBuffer()
      : await sharp(input, { limitInputPixels: false })
          .rotate()
          .resize({ width: 1080, withoutEnlargement: true })
          .webp({ quality: 80, effort: 4 })
          .toBuffer();
    return out.length < input.length * 0.8 ? { buffer: out, contentType: "image/webp" } : null;
  } catch {
    return null; // fichier exotique : on garde l'original
  }
}

/** Optimise un fichier déjà dans le stockage → renvoie l'URL publique (optimisée si possible). */
export async function optimizeStoredFile(bucket: string, path: string): Promise<string> {
  const pub = supabaseAdmin.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  const { data, error } = await supabaseAdmin.storage.from(bucket).download(path);
  if (error || !data) return pub;
  const buf = Buffer.from(await data.arrayBuffer());
  const opt = await optimizeImageBuffer(buf, data.type || guessType(path));
  if (!opt) return pub;
  const newPath = path.replace(/\.[a-z0-9]+$/i, "") + ".opt.webp";
  const { error: upErr } = await supabaseAdmin.storage.from(bucket)
    .upload(newPath, opt.buffer, { contentType: opt.contentType, upsert: true, cacheControl: "31536000" });
  if (upErr) return pub;
  return supabaseAdmin.storage.from(bucket).getPublicUrl(newPath).data.publicUrl;
}

function guessType(path: string) {
  const e = path.split(".").pop()?.toLowerCase();
  return e === "gif" ? "image/gif" : e === "png" ? "image/png" : e === "webp" ? "image/webp" : "image/jpeg";
}

/**
 * Filet de sécurité (cron) : trouve dans TOUTES les landing pages les images
 * encore lourdes, les optimise et remplace les liens. Quelques fichiers par passage.
 */
export async function optimizeAllLandingMedia(maxFiles = 4) {
  const { data } = await supabaseAdmin.from("landing_pages").select("*");
  const rows = (data ?? []) as Record<string, unknown>[];
  const re = /https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/([a-z0-9_-]+)\/([^"\s\\]+?\.(?:gif|png|jpe?g))(?=["\s\\]|$)/gi;
  const seen = new Map<string, string>();
  let done = 0;
  for (const row of rows) {
    const blob = JSON.stringify(row);
    const changes = new Map<string, string>();
    for (const m of blob.matchAll(re)) {
      if (done >= maxFiles) break;
      const url = m[0], bucket = m[1], path = decodeURIComponent(m[2]);
      if (seen.has(url)) { changes.set(url, seen.get(url)!); continue; }
      const head = await fetch(url, { method: "HEAD" }).catch(() => null);
      const size = Number(head?.headers.get("content-length") ?? 0);
      if (size && size < MIN_BYTES) { seen.set(url, url); continue; }
      const nu = await optimizeStoredFile(bucket, path);
      seen.set(url, nu);
      if (nu !== url) { changes.set(url, nu); done++; }
    }
    if (!changes.size) continue;
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (["id", "created_at"].includes(k) || v == null) continue;
      const s = JSON.stringify(v);
      let n = s;
      for (const [a, b] of changes) n = n.split(a).join(b);
      if (n !== s) patch[k] = JSON.parse(n);
    }
    if (Object.keys(patch).length) await supabaseAdmin.from("landing_pages").update(patch as never).eq("id", String(row.id));
  }
  return { ok: true, optimized: done };
}

/**
 * Filet de sécurité élargi (cron toutes les 15 min) : photos produits (boutique + LP),
 * réglages boutique / design LP (hero, tuiles, galerie, bannières) et landing pages.
 * Toute image > 300 Ko est convertie en WebP 1080 px, et les liens sont remplacés partout.
 */
export async function optimizeAllMedia(maxFiles = 6) {
  const re = /https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/(product-images|lp-media)\/([^"\s\\?]+?\.(?:png|jpe?g|webp))(?=["\s\\?]|$)/gi;
  const [{ data: imgs }, { data: lps }, { data: sets }] = await Promise.all([
    supabaseAdmin.from("product_images").select("id, public_url"),
    supabaseAdmin.from("landing_pages").select("*"),
    supabaseAdmin.from("app_settings").select("key, value").in("key", ["lp_design", "store_config"]),
  ]);
  const urls = new Set<string>();
  for (const i of (imgs ?? []) as { public_url: string | null }[]) if (i.public_url) urls.add(i.public_url);
  for (const m of JSON.stringify([lps ?? [], sets ?? []]).matchAll(re)) urls.add(m[0]);

  const map = new Map<string, string>();
  for (const url of urls) {
    if (map.size >= maxFiles) break;
    if (/\.opt\.webp$/i.test(url)) continue;
    const m = url.match(/\/object\/public\/(product-images|lp-media)\/(.+)$/i);
    if (!m) continue;
    const head = await fetch(url, { method: "HEAD" }).catch(() => null);
    const size = Number(head?.headers.get("content-length") ?? 0);
    if (!head?.ok || (size && size < MIN_BYTES)) continue;
    const nu = await optimizeStoredFile(m[1], decodeURIComponent(m[2]));
    if (nu !== url) map.set(url, nu);
  }
  if (!map.size) return { ok: true, optimized: 0 };

  const sub = (s: string) => { let n = s; for (const [a, b] of map) n = n.split(a).join(b); return n; };
  for (const i of (imgs ?? []) as { id: string; public_url: string | null }[]) {
    if (i.public_url && map.has(i.public_url))
      await supabaseAdmin.from("product_images").update({ public_url: map.get(i.public_url) } as never).eq("id", i.id);
  }
  for (const row of (lps ?? []) as Record<string, unknown>[]) {
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (["id", "created_at"].includes(k) || v == null) continue;
      const s = JSON.stringify(v), n = sub(s);
      if (n !== s) patch[k] = JSON.parse(n);
    }
    if (Object.keys(patch).length) await supabaseAdmin.from("landing_pages").update(patch as never).eq("id", String(row.id));
  }
  for (const st of (sets ?? []) as { key: string; value: unknown }[]) {
    const str = typeof st.value === "string" ? st.value : JSON.stringify(st.value);
    const n = sub(str);
    if (n !== str) await supabaseAdmin.from("app_settings")
      .update({ value: typeof st.value === "string" ? n : JSON.parse(n) } as never).eq("key", st.key);
  }
  const { revalidateTag } = await import("next/cache");
  revalidateTag("store");
  return { ok: true, optimized: map.size };
}
