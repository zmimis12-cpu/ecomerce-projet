import { redirect } from "next/navigation";
import { ensureProfile } from "@/lib/auth/session";
import { AdminSidebar } from "@/components/admin/sidebar";
import { AdminHeader } from "@/components/admin/header";
import { MissingProfileBanner } from "@/components/admin/missing-profile-banner";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await ensureProfile();
  if (!session) redirect("/login");

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
          {!session.hasProfile && <MissingProfileBanner email={session.authEmail} />}
          <div className="p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
