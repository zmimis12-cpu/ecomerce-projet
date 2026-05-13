import { redirect } from "next/navigation";

/**
 * Root route — redirect to /admin.
 * Middleware will redirect to /login if not authenticated.
 */
export default function RootPage() {
  redirect("/admin");
}
