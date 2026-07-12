/**
 * scripts/migrate-images-to-r2.ts
 * Migre toutes les images de product_images (actuellement sur Supabase
 * Storage) vers Cloudflare R2, et met à jour public_url en base.
 *
 * USAGE (une seule fois, après avoir configuré R2 et déployé le nouveau code):
 *   npx tsx scripts/migrate-images-to-r2.ts
 *
 * Nécessite les mêmes variables d'env que l'app (SUPABASE_SERVICE_ROLE_KEY,
 * NEXT_PUBLIC_SUPABASE_URL, R2_*) dans .env.local ou l'environnement.
 */
import { createClient } from "@supabase/supabase-js";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME!;
const PUBLIC_URL = process.env.R2_PUBLIC_URL!;

async function main() {
  console.log("Récupération des images produits...");
  const { data: images, error } = await supabase
    .from("product_images")
    .select("id, storage_path, public_url");

  if (error) throw error;
  console.log(`${images?.length ?? 0} image(s) à migrer.`);

  let ok = 0, failed = 0;

  for (const img of (images ?? []) as { id: string; storage_path: string; public_url: string }[]) {
    try {
      // Télécharger depuis Supabase Storage
      const { data: blob, error: dlErr } = await supabase.storage
        .from("product-images")
        .download(img.storage_path);
      if (dlErr || !blob) throw dlErr ?? new Error("blob vide");

      const buffer = Buffer.from(await blob.arrayBuffer());
      const contentType = blob.type || "image/jpeg";

      // Uploader vers R2
      await r2.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: img.storage_path,
        Body: buffer,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      }));

      const newUrl = `${PUBLIC_URL.replace(/\/$/, "")}/${img.storage_path}`;

      // Mettre à jour l'URL en base
      const { error: updErr } = await supabase
        .from("product_images")
        .update({ public_url: newUrl })
        .eq("id", img.id);
      if (updErr) throw updErr;

      console.log(`✅ ${img.storage_path}`);
      ok++;
    } catch (e) {
      console.error(`❌ ${img.storage_path}:`, e instanceof Error ? e.message : e);
      failed++;
    }
  }

  console.log(`\nTerminé: ${ok} migrées, ${failed} échouées.`);
  if (failed > 0) {
    console.log("Les images échouées gardent leur ancienne URL Supabase — relance le script pour réessayer.");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
