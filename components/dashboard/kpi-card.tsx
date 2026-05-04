import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface KpiCardProps {
  label:      string;
  value:      string;
  sub?:       string;
  icon?:      LucideIcon;
  trend?:     "up" | "down" | "neutral";
  variant?:   "default" | "green" | "red" | "amber" | "blue";
  highlight?: boolean;
}

export function KpiCard({ label, value, sub, icon: Icon, variant = "default", highlight }: KpiCardProps) {
  const variantClass = {
    default: "border-border",
    green:   "border-green-200 bg-green-50/50",
    red:     "border-red-200 bg-red-50/50",
    amber:   "border-amber-200 bg-amber-50/50",
    blue:    "border-blue-200 bg-blue-50/50",
  }[variant];

  const valueClass = {
    default: "text-foreground",
    green:   "text-green-700",
    red:     "text-red-700",
    amber:   "text-amber-700",
    blue:    "text-blue-700",
  }[variant];

  return (
    <div className={cn(
      "rounded-xl border bg-card p-4 space-y-2",
      variantClass,
      highlight && "ring-2 ring-primary/20"
    )}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground/50" />}
      </div>
      <p className={cn("text-2xl font-bold tracking-tight", valueClass)}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// Rate badge — shows % with color coding
export function RateBadge({ rate, label, threshold = 50 }: { rate: number; label: string; threshold?: number }) {
  const good = rate >= threshold;
  return (
    <div className={cn(
      "rounded-xl border p-4 space-y-2",
      good ? "border-green-200 bg-green-50/50" : "border-amber-200 bg-amber-50/50"
    )}>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <div className="flex items-end gap-1">
        <span className={cn("text-2xl font-bold", good ? "text-green-700" : "text-amber-700")}>
          {rate.toFixed(1)}%
        </span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", good ? "bg-green-500" : "bg-amber-500")}
          style={{ width: `${Math.min(rate, 100)}%` }}
        />
      </div>
    </div>
  );
}
