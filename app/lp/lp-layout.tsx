/**
 * Public landing page layout — completely isolated from admin.
 * No admin chrome, no session check, no sidebar.
 * Overrides the root layout for /lp/* routes.
 */
export default function LpLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
