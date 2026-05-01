import { redirect } from "next/navigation";
import { getDebugSession } from "@/lib/auth/session";
import { AdminSidebar } from "@/components/admin/sidebar";
import { AdminHeader } from "@/components/admin/header";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const debug = await getDebugSession();
  if (!debug.authId) redirect("/login");

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AdminSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AdminHeader
          displayName={debug.displayName}
          email={debug.authEmail ?? ""}
          role={debug.role}
        />
        <main className="flex-1 overflow-auto">
          <div className="p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
