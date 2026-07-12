/**
 * lib/storage/r2-client.ts
 * Client Cloudflare R2 (API S3-compatible) — remplace Supabase Storage pour
 * les images produits. R2 = 10 GB gratuit + ZÉRO frais d'egress (jamais),
 * contrairement à Supabase Storage dont le "cached egress" a un quota strict
 * sur le plan gratuit.
 *
 * Variables d'env requises (à ajouter sur Vercel):
 *   R2_ACCOUNT_ID        — ID de compte Cloudflare
 *   R2_ACCESS_KEY_ID     — clé API R2 (créée dans R2 → Manage API Tokens)
 *   R2_SECRET_ACCESS_KEY — secret associé
 *   R2_BUCKET_NAME       — nom du bucket (ex: "hajtek-product-images")
 *   R2_PUBLIC_URL        — URL publique du bucket (custom domain ou *.r2.dev)
 */
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

function getR2Client(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 non configuré — vérifie R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY sur Vercel.");
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export async function uploadToR2(path: string, buffer: Buffer, contentType: string): Promise<{ publicUrl: string }> {
  const bucket = process.env.R2_BUCKET_NAME;
  const publicBase = process.env.R2_PUBLIC_URL;
  if (!bucket || !publicBase) {
    throw new Error("R2_BUCKET_NAME ou R2_PUBLIC_URL manquant.");
  }

  const client = getR2Client();
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: path,
    Body: buffer,
    ContentType: contentType,
    CacheControl: "public, max-age=31536000, immutable", // 1 an — les noms de fichiers sont uniques, jamais réécrits
  }));

  const publicUrl = `${publicBase.replace(/\/$/, "")}/${path}`;
  return { publicUrl };
}

export async function deleteFromR2(path: string): Promise<void> {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) return;
  const client = getR2Client();
  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: path }));
  } catch {
    // best-effort — ne bloque pas la suppression en DB si le fichier n'existe déjà plus
  }
}
