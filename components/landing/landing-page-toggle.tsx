"use client";
import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

export function LandingPageToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const [active, setActive]          = useState(isActive);
  const [isPending, startTransition] = useTransition();
  const router                       = useRouter();

  function toggle() {
    startTransition(async () => {
      const supabase = createClient();
      await supabase.from("landing_pages").update({ is_active: !active } as never).eq("id", id);
      setActive(!active);
      router.refresh();
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
