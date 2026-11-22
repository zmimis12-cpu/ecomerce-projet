"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { unblockPhone } from "@/lib/orders/blocklist-actions";

export function UnblockButton({ phone }: { phone: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <button type="button" disabled={isPending}
      onClick={() => startTransition(async () => { await unblockPhone(phone); router.refresh(); })}
      className="rounded-lg border px-3 py-1 text-xs hover:bg-secondary disabled:opacity-50">
      {isPending ? "…" : "Débloquer"}
    </button>
  );
}
