import { cn } from "@/lib/utils";
import { RETURN_CONDITION_LABELS, RETURN_CONDITION_COLORS } from "@/types/scanner";
import type { ReturnCondition } from "@/types/scanner";

export function ReturnConditionBadge({ condition }: { condition: string }) {
  const color = RETURN_CONDITION_COLORS[condition as ReturnCondition]
    ?? { bg: "bg-slate-100", text: "text-slate-600" };
  const label = RETURN_CONDITION_LABELS[condition as ReturnCondition] ?? condition;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", color.bg, color.text)}>
      {label}
    </span>
  );
}
