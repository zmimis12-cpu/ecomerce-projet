"use server";
import { requireRole } from "@/lib/auth/session";
import { optimizeStoredFile } from "./optimize-media";

/** Appelé juste après un envoi d'image depuis l'éditeur de landing page. */
export async function optimizeUploadedMedia(bucket: string, path: string): Promise<string> {
  await requireRole(["super_admin", "admin", "manager"]);
  if (!["lp-media", "product-images"].includes(bucket)) throw new Error("bucket");
  return optimizeStoredFile(bucket, path);
}
