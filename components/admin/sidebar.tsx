"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Package, ShoppingCart, PhoneCall,
  Truck, Layers, FileSpreadsheet, FileText, FolderOpen,
  ScanLine, RotateCcw, BarChart3, Globe, Settings,
  Shield, Phone, CalendarClock, Award,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/lib/settings/users-constants";

// ─── Nav item definition ────────────────────────────────────────────────────
type NavItem = { href: string; label: string; icon: React.ElementType; exact?: boolean };
type NavGroup = { label: string | null; items: NavItem[] };

// ─── Full nav map — filtered per role ───────────────────────────────────────
const ALL_NAV: NavGroup[] = [
  {
    label: null,
    items: [
      { href: "/admin",             label: "Dashboard",    icon: LayoutDashboard, exact: true  },
      { href: "/admin/products",    label: "Produits",     icon: Package          },
      { href: "/admin/orders",      label: "Commandes",    icon: ShoppingCart     },
      { href: "/admin/call-center", label: "Call Center",  icon: PhoneCall        },
      { href: "/admin/call-center/commissions", label: "Commissions CC", icon: Award },  
    ],
  },
  {
    label: "Livraison",
    items: [
      { href: "/admin/delivery",            label: "Suivi Livraison",    icon: Truck,          exact: true },
      { href: "/admin/delivery/documents",  label: "BL du Jour",         icon: FileText        },
      { href: "/admin/delivery/batches",    label: "Tickets Impression", icon: Layers          },
      { href: "/admin/delivery/notes",      label: "Récap Tickets",      icon: FileText        },
      { href: "/admin/digylog/documents",   label: "Documents Digylog",  icon: FolderOpen      },
      { href: "/admin/delivery/invoices",   label: "Factures",           icon: FileText        },
      { href: "/admin/scanner",             label: "Scanner",            icon: ScanLine        },
      { href: "/admin/returns",             label: "Retours",            icon: RotateCcw       },
      { href: "/admin/delivery/sheet-sync", label: "Sheet Sync",         icon: FileSpreadsheet },
    ],
  },
  {
    label: "Business",
    items: [
      { href: "/admin/finance",       label: "Finance",       icon: BarChart3 },
      { href: "/admin/landing-pages", label: "Landing Pages", icon: Globe     },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/admin/audit-logs", label: "Audit Logs",  icon: Shield   },
      { href: "/admin/settings",   label: "Paramètres",  icon: Settings },
    ],
  },
];

// ─── Call center agent gets its own minimal nav ──────────────────────────────
const CC_AGENT_NAV: NavGroup[] = [
  {
    label: null,
    items: [
      { href: "/admin/call-center/my-dashboard", label: "Mon Dashboard",  icon: LayoutDashboard, exact: true  },
      { href: "/admin/call-center/queue",         label: "File d'appels", icon: Phone,           exact: false },
      { href: "/admin/call-center/my-orders",     label: "Mes commandes", icon: ShoppingCart,    exact: false },
    ],
  },
];

// ─── Scanner agent nav ───────────────────────────────────────────────────────
const SCANNER_AGENT_NAV: NavGroup[] = [
  {
    label: null,
    items: [
      { href: "/admin/scanner", label: "Scanner", icon: ScanLine  },
      { href: "/admin/returns", label: "Retours",  icon: RotateCcw },
    ],
  },
];

// ─── Routes allowed per role ─────────────────────────────────────────────────
const ROLE_ALLOWED_PREFIXES: Record<AppRole, string[]> = {
  super_admin:       ["/admin"],
  admin:             ["/admin"],
  manager:           ["/admin"],
  finance:           ["/admin/finance", "/admin/delivery/invoices", "/admin/orders", "/admin/digylog", "/admin"],
  scanner_agent:     ["/admin/scanner", "/admin/returns"],
  call_center_agent: ["/admin/call-center/my-dashboard", "/admin/call-center/queue", "/admin/call-center/my-orders", "/admin/call-center"],
  media_buyer:       ["/admin/finance", "/admin/landing-pages", "/admin"],
  viewer:            ["/admin/orders", "/admin"],
};

function getNavForRole(role: AppRole): NavGroup[] {
  if (role === "call_center_agent") return CC_AGENT_NAV;
  if (role === "scanner_agent")     return SCANNER_AGENT_NAV;

  // For other roles — filter ALL_NAV by allowed prefixes
  const allowed = ROLE_ALLOWED_PREFIXES[role] ?? ["/admin"];

  if (allowed.includes("/admin")) return ALL_NAV; // full access

  return ALL_NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) =>
      allowed.some((prefix) => item.href.startsWith(prefix))
    ),
  })).filter((group) => group.items.length > 0);
}

// ─── Component ───────────────────────────────────────────────────────────────
export function AdminSidebar({ role }: { role: AppRole }) {
  const pathname  = usePathname();
  const navGroups = getNavForRole(role);

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    if (href === "/admin/delivery") return pathname === "/admin/delivery";
    if (href === "/admin") return pathname === "/admin";
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
        {navGroups.map((group, gi) => (
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
        <p className="text-xs text-muted-foreground">GestionPro v2.0</p>
      </div>
    </aside>
  );
}
