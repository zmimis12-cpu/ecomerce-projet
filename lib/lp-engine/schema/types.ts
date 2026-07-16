/**
 * lib/lp-engine/schema/types.ts
 * Types partagés du Section Engine — source de vérité unique consommée par
 * le générateur IA, l'éditeur admin et le renderer public.
 */
import { z } from "zod";

export const MediaRefSchema = z.object({
  type: z.enum(["image", "video", "gif", "before_after"]),
  url: z.string(),
  alt: z.string().default(""),
});
export type MediaRef = z.infer<typeof MediaRefSchema>;

export interface ProductContext {
  productId: string;
  productName: string;
  price: number;
  description: string | null;
  targetAudience?: string;
  mediaCount: number;
}

export interface VisibilityRule {
  minMediaCount?: number;
  requiresField?: string;
}

export interface SectionDefinition<T> {
  type: string;
  version: number;
  zodSchema: z.ZodType<T>;
  defaultData: (ctx: ProductContext) => T;
  visibility?: VisibilityRule;
  variants?: string[];
  ownsMedia: boolean;
}

/** Squelette d'ordre/visibilité — séparé des données de contenu (Phase 2) */
export interface OrderedSection {
  type: string;
  order: number;
  enabled: boolean;
  variant?: string;
}
