/**
 * lib/lp-engine/schema/sections/comparison-table.schema.ts
 */
import { z } from "zod";
import type { SectionDefinition, ProductContext } from "../types";

export const ComparisonTableSchema = z.object({
  title: z.string().min(1),
  ours_label: z.string().default("منتجنا"),
  theirs_label: z.string().default("الحلول العادية"),
  rows: z.array(z.object({
    feature: z.string().min(1),
    ours: z.boolean(),
    theirs: z.boolean(),
  })).min(1).max(8),
});

export type ComparisonTableData = z.infer<typeof ComparisonTableSchema>;

export const comparisonTableDefinition: SectionDefinition<ComparisonTableData> = {
  type: "comparison_table",
  version: 1,
  zodSchema: ComparisonTableSchema,
  defaultData: (ctx: ProductContext) => ({
    title: `لماذا ${ctx.productName} هو الأفضل؟`,
    ours_label: "منتجنا",
    theirs_label: "الحلول العادية",
    rows: [
      { feature: "جودة عالية", ours: true, theirs: false },
      { feature: "ضمان استبدال", ours: true, theirs: false },
      { feature: "الدفع عند الاستلام", ours: true, theirs: false },
      { feature: "دعم بعد البيع", ours: true, theirs: false },
      { feature: "سعر مناسب مقابل الجودة", ours: true, theirs: false },
    ],
  }),
  ownsMedia: false,
};
