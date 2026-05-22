"use client";
/**
 * StoreFilter — reusable store/provider filter dropdown.
 * Updates URL params without full page reload via Next.js navigation.
 */
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Store } from "lucide-react";

export type StoreOption = { id: string; name: string; providerSlug: string };

export function StoreFilter({ stores }: { stores: StoreOption[] }) {
  const router     = useRouter();
  const pathname   = usePathname();
  const searchParams = useSearchParams();
  const current    = searchParams.get("store") ?? "";

  function handleChange(value: string) {
    const p = new URLSearchParams(searchParams.toString());
    if (value) p.set("store", value); else p.delete("store");
    p.delete("page"); // reset pagination
    router.push(`${pathname}?${p.toString()}`);
  }

  if (stores.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <Store className="h-4 w-4 text-muted-foreground shrink-0" />
      <select
        value={current}
        onChange={(e) => handleChange(e.target.value)}
        className="h-9 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring min-w-[160px]"
      >
        <option value="">Tous les stores</option>
        {stores.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} ({s.providerSlug})
          </option>
        ))}
      </select>
    </div>
  );
}
