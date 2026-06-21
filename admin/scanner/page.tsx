import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { ScannerClient } from "@/components/scanner/scanner-client";

export const metadata: Metadata = { title: "Scanner" };
export const dynamic = "force-dynamic";

export default async function ScannerPage() {
  await requireRole(["super_admin", "admin", "manager", "scanner_agent"]);
  // Auth check done server-side — all interaction is client-side
  return <ScannerClient />;
}
