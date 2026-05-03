"use client";
import { useState, useTransition } from "react";
import { toggleLandingPage } from "@/lib/landing-pages/actions";
import { cn } from "@/lib/utils";

export function LandingPageToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const [active, setActive]          = useState(isActive);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    const next = !active;
    setActive(next); // optimistic
    startTransition(async () => {
      const res = await toggleLandingPage(id, next);
      if (!res.success) setActive(!next); // revert on failure
    });
  }

  return (
    <button type="button" onClick={toggle} disabled={isPending}
      className={cn(
        "relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50",
        active ? "bg-green-500" : "bg-slate-300"
      )}>
      <span className={cn(
        "inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform",
        active ? "translate-x-[18px]" : "translate-x-1"
      )} />
    </button>
  );
}
