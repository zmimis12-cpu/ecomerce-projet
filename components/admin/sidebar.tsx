"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Package, ShoppingCart, PhoneCall,
  Truck, Layers, FileSpreadsheet, FileText, FolderOpen,
  BookOpen, ScanLine, RotateCcw, BarChart3, Globe,
  Settings, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Nav structure with groups ──────────────────────────────────────────────────
const NAV_GROUPS = [
  {
    label: null,
    items: [
      { href: "/admin",             label: "Dashboard",   icon: LayoutDashboard, exact: true  },
      { href: "/admin/products",    label: "Produits",    icon: Package,          exact: false },
      { href: "/admin/orders",      label: "Commandes",   icon: ShoppingCart,     exact: false },
      { href: "/admin/call-center", label: "Call Center", icon: PhoneCall,        exact: false },
    ],
  },
  {
    label: "Livraison",
    items: [
      { href: "/admin/delivery",                label: "Livraison",      icon: Truck,           exact: true  },
      { href: "/admin/delivery/notes",          label: "Delivery Notes", icon: BookOpen,        exact: false },
      { href: "/admin/delivery/batches",        label: "Groupes",        icon: Layers,          exact: false },
      { href: "/admin/delivery/sheet-sync",     label: "Sheet Sync",     icon: FileSpreadsheet, exact: false },
      { href: "/admin/delivery/invoices",       label: "Factures",       icon: FileText,        exact: false },
      { href: "/admin/delivery/documents",      label: "Documents",      icon: FolderOpen,      exact: false },
      { href: "/admin/digylog/documents",       label: "Digylog Docs",   icon: FileText,        exact: false },
      { href: "/admin/audit-logs",              label: "Audit Logs",     icon: FileText,        exact: false },
    ],
  },
  {
    label: "Opérations",
    items: [
      { href: "/admin/scanner",     label: "Scanner",     icon: ScanLine,  exact: false },
      { href: "/admin/returns",     label: "Retours",     icon: RotateCcw, exact: false },
    ],
  },
  {
    label: "Business",
    items: [
      { href: "/admin/finance",           label: "Finance",         icon: BarChart3, exact: false },
      { href: "/admin/landing-pages",     label: "Landing Pages",   icon: Globe,     exact: false },
      { href: "/admin/automation",        label: "Automation",      icon: Zap,       exact: false },
    ],
  },
  {
    label: "Paramètres",
    items: [
      { href: "/admin/settings/delivery", label: "Config Digylog",  icon: Settings,  exact: false },
    ],
  },
];

export function AdminSidebar() {
  const pathname = usePathname();

  function isActive(href: string, exact: boolean) {
    if (exact) return pathname === href;
    // Special case: /admin/delivery exact check so sub-items don't also activate "Livraison"
    if (href === "/admin/delivery") return pathname === "/admin/delivery";
    return pathname.startsWith(href);
  }

  return (
    <aside className="w-56 shrink-0 border-r bg-card flex flex-col">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-5 border-b">
        <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center shrink-0">
          <span className="text-primary-foreground font-bold text-xs">GP</span>
        </div>
        <span className="font-semibold text-sm tracking-tight">GestionPro</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-4">
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi} className="space-y-0.5">
            {group.label && (
              <p className="px-3 py-1 text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">
                {group.label}
              </p>
            )}
            {group.items.map(({ href, label, icon: Icon, exact }) => (
              <Link key={href} href={href}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive(href, exact)
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                )}>
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className="px-4 py-3 border-t shrink-0">
        <p className="text-xs text-muted-foreground">v2.0</p>
      </div>
    </aside>
  );
}
