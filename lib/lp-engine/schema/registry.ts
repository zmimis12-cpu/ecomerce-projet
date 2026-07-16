/**
 * lib/lp-engine/schema/registry.ts
 * Registre central — source de vérité unique lue par le générateur IA,
 * l'éditeur admin et le renderer public. Ajouter un type de section =
 * ajouter une entrée ici, rien d'autre à synchroniser manuellement.
 */
import type { SectionDefinition } from "./types";
import { comparisonTableDefinition } from "./sections/comparison-table.schema";
import { statsBarDefinition } from "./sections/stats-bar.schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SECTION_REGISTRY: Record<string, SectionDefinition<any>> = {
  comparison_table: comparisonTableDefinition,
  stats_bar: statsBarDefinition,
  // Les autres types (hero, benefits, reviews, faq...) restent gérés par
  // l'ancien système (lib/templates, lib/ai/generator) tant qu'ils n'ont
  // pas été migrés un par un vers ce registre — migration progressive,
  // pas un big-bang qui casse tout d'un coup.
};

export function isMigratedSectionType(type: string): boolean {
  return type in SECTION_REGISTRY;
}

/** Valide des données contre le schéma Zod du type — throw si invalide */
export function validateSection(type: string, data: unknown) {
  const def = SECTION_REGISTRY[type];
  if (!def) throw new Error(`Unknown migrated section type: ${type}`);
  return def.zodSchema.parse(data);
}

/** Valide sans throw — retourne { success, data|error } pour usage UI */
export function safeValidateSection(type: string, data: unknown) {
  const def = SECTION_REGISTRY[type];
  if (!def) return { success: false as const, error: `Type inconnu: ${type}` };
  const result = def.zodSchema.safeParse(data);
  if (!result.success) return { success: false as const, error: result.error.message };
  return { success: true as const, data: result.data };
}
