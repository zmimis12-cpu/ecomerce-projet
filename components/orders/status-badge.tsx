import { cn } from "@/lib/utils";
import { STATUS_LABELS, STATUS_COLORS } from "@/types/orders";
import type { OrderStatus } from "@/types/orders";

export function StatusBadge({ status }: { status: OrderStatus }) {
  const color = STATUS_COLORS[status] ?? STATUS_COLORS.pending;
  const label = STATUS_LABELS[status] ?? status;
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
