import { redirect } from "next/navigation";
import { ensureProfile } from "@/lib/auth/session";
import { AdminSidebar } from "@/components/admin/sidebar";
import { AdminHeader } from "@/components/admin/header";
import { MissingProfileBanner } from "@/components/admin/missing-profile-banner";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await ensureProfile();

  // No auth session at all → middleware should have caught this, but belt + suspenders
  if (!session) redirect("/login");

  // Check for unauthorized error passed via query param
  // (set by requireAdmin / requireRole when role is insufficient)

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AdminSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AdminHeader
          displayName={session.displayName}
          email={session.authEmail}
          role={session.role}
        />
        <main className="flex-1 overflow-auto">
          {/* Show non-blocking warning if profile row had to be auto-created */}
          {!session.hasProfile && <MissingProfileBanner email={session.authEmail} />}
          <div className="p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
