/** Re-monté à chaque navigation → petite animation d'entrée de page. */
export default function AdminTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-fade-in-up">{children}</div>;
}
