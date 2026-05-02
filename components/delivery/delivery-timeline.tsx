import { buildTimeline } from "@/types/delivery";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle } from "lucide-react";

interface DeliveryTimelineProps {
  order: Parameters<typeof buildTimeline>[0];
}

export function DeliveryTimeline({ order }: DeliveryTimelineProps) {
  const steps = buildTimeline(order);

  return (
    <div className="space-y-0">
      {steps.map((step, idx) => (
        <div key={step.key} className="flex gap-3">
          {/* Icon + line */}
          <div className="flex flex-col items-center">
            <div className={cn(
              "h-7 w-7 rounded-full flex items-center justify-center shrink-0 border-2 transition-colors",
              step.done    ? "bg-primary border-primary text-primary-foreground" :
              step.current ? "bg-primary/20 border-primary text-primary" :
              "bg-background border-border text-muted-foreground"
            )}>
              {step.done
                ? <CheckCircle2 className="h-4 w-4" />
                : <Circle className="h-3 w-3" />}
            </div>
            {idx < steps.length - 1 && (
              <div className={cn(
                "w-0.5 flex-1 my-0.5 min-h-[1.5rem]",
                step.done ? "bg-primary" : "bg-border"
              )} />
            )}
          </div>

          {/* Content */}
          <div className={cn("pb-5 flex-1", idx === steps.length - 1 && "pb-0")}>
            <p className={cn(
              "text-sm font-medium leading-none mt-1.5",
              step.done ? "text-foreground" : "text-muted-foreground"
            )}>
              {step.label}
            </p>
            {step.date && (
              <p className="text-xs text-muted-foreground mt-1">
                {new Date(step.date).toLocaleString("fr-MA", {
                  day: "2-digit", month: "2-digit", year: "numeric",
                  hour: "2-digit", minute: "2-digit"
                })}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
