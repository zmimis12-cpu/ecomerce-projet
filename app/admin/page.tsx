import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { DashboardPlaceholder } from "@/components/admin/dashboard-placeholder";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireUser();
  const params = await searchParams;

  return (
    <DashboardPlaceholder
      displayName={session.displayName}
      email={session.authEmail}
      role={session.role}
      isActive={session.profile?.is_active ?? true}
      hasProfile={session.hasProfile}
      unauthorizedError={params.error === "unauthorized"}
    />
  );
}
