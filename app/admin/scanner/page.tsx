import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { ScanInput } from "@/components/scanner/scan-input";
import { ScannerModeSwitcher } from "@/components/scanner/scanner-mode-switcher";

export const metadata: Metadata = { title: "Scanner" };
// No force-dynamic — page shell is static, all scanning is client-side actions
export const dynamic = "force-dynamic";

export default async function ScannerPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  await requireRole(["super_admin", "admin", "manager", "scanner_agent"]);
  const params = await searchParams;
  const mode   = params.mode === "return" ? "return" : "exit";

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Scanner</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Scan des expéditions et retours entrepôt.
        </p>
      </div>
      <ScannerModeSwitcher currentMode={mode} />
      <ScanInput mode={mode} />
    </div>
  );
}
