import { useId } from "react";
import { cn } from "@/lib/utils";

/** Monogramme HZ — HajtekZone (or sur fond noir). Pur SVG, net à toutes les tailles. */
export function HajtekMark({ className }: { className?: string }) {
  // id unique : le logo peut apparaître 2 fois (sidebar bureau cachée + tiroir mobile)
  const gid = "hzg" + useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <svg viewBox="0 0 64 64" className={cn("h-9 w-9", className)} aria-label="HajtekZone" role="img">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F3D98B" />
          <stop offset="0.5" stopColor="#D4A93F" />
          <stop offset="1" stopColor="#A77A1E" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="31" fill="#121212" />
      <circle cx="32" cy="32" r="29.5" fill="none" stroke={`url(#${gid})`} strokeWidth="1.2" opacity="0.7" />
      <path d="M44 13.5 A20 20 0 1 0 49.5 42" fill="none" stroke={`url(#${gid})`} strokeWidth="2.4" strokeLinecap="round" />
      {/* H */}
      <path d="M17 22v20M17 32h11M28 22v20" stroke="#ECECEC" strokeWidth="4.2" strokeLinecap="round" fill="none" />
      {/* Z */}
      <path d="M33 22h14l-14 20h14" stroke={`url(#${gid})`} strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

/** Logo complet : monogramme + HAJTEK ZONE (+ sous-titre optionnel). */
export function HajtekLogo({
  className, sub = "GestionPro", tone = "dark",
}: { className?: string; sub?: string | null; tone?: "dark" | "light" }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <HajtekMark className="h-10 w-10 shrink-0 drop-shadow-sm" />
      <div className="leading-none">
        <div className={cn("text-[15px] font-extrabold tracking-[0.14em]", tone === "dark" ? "text-white" : "text-neutral-900")}>
          HAJTEK <span className="bg-gradient-to-r from-[#F3D98B] via-[#D4A93F] to-[#A77A1E] bg-clip-text text-transparent">ZONE</span>
        </div>
        {sub && (
          <div className={cn("mt-1 text-[10px] font-medium uppercase tracking-[0.22em]", tone === "dark" ? "text-white/45" : "text-neutral-500")}>
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}
