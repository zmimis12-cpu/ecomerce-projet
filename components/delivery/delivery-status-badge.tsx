import { cn } from "@/lib/utils";
import { DELIVERY_STATUS_LABELS, DELIVERY_STATUS_COLORS } from "@/types/delivery";
import type { DeliveryStatus } from "@/types/delivery";

export function DeliveryStatusBadge({ status }: { status: string }) {
  const color = DELIVERY_STATUS_COLORS[status as DeliveryStatus]
    ?? { bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400" };
  const label = DELIVERY_STATUS_LABELS[status as DeliveryStatus] ?? status;
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
      color.bg, color.text
    )}>
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", color.dot)} />
      {label}
    </span>
  );
}
