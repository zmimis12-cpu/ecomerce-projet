import { cn } from "@/lib/utils";
import { CALL_RESULT_LABELS, CALL_RESULT_COLORS } from "@/types/call-center";
import type { CallResult } from "@/types/call-center";

export function CallResultBadge({ result }: { result: string }) {
  const color = CALL_RESULT_COLORS[result as CallResult] ?? { bg: "bg-slate-100", text: "text-slate-600" };
  const label = CALL_RESULT_LABELS[result as CallResult] ?? result;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", color.bg, color.text)}>
      {label}
    </span>
  );
}
