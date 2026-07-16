/**
 * lib/lp-engine/schema/sections/stats-bar.schema.ts
 */
import { z } from "zod";
import type { SectionDefinition, ProductContext } from "../types";

export const StatsBarSchema = z.object({
  items: z.array(z.object({
    percent: z.string().min(1),
    label: z.string().min(1),
  })).min(1).max(4),
});

export type StatsBarData = z.infer<typeof StatsBarSchema>;

export const statsBarDefinition: SectionDefinition<StatsBarData> = {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type: "stats_bar",
  version: 1,
  zodSchema: StatsBarSchema,
  defaultData: (_ctx: ProductContext) => ({
    items: [
      { percent: "98%", label: "من العملاء راضين على النتيجة" },
      { percent: "+2000", label: "طلبية توصلت بنجاح" },
      { percent: "24/48h", label: "مدة التوصيل" },
    ],
  }),
  ownsMedia: false,
};
