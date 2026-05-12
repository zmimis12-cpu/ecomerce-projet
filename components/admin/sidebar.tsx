"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Package, ShoppingCart, PhoneCall,
  Truck, Layers, FileSpreadsheet, FileText, FolderOpen,
  ScanLine, RotateCcw, BarChart3, Globe, Settings,
  Shield, Award, Users, ListOrdered,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/lib/settings/users-constants";

type NavItem = { href: string; label: string; icon: React.ElementType; exact?: boolean };
type NavGroup = { label: string | null; items: NavItem[]; groupPrefix?: string };

const ADMIN_NAV: NavGroup[] = [
  {
    label: null,
    items: [
      { href: "/admin",          label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/admin/products", label: "Produits",  icon: Package          },
      { href: "/admin/orders",   label: "Commandes", icon: ShoppingCart     },
    ],
  },
  {
    label: "Call Center",
    groupPrefix: "/admin/call-center",
    items: [
      { href: "/admin/call-center",             label: "Vue globale",     icon: PhoneCall,    exact: true },
      { href: "/admin/call-center/queue",        label: "File d'appels",   icon: ListOrdered   },
      { href: "/admin/call-center/agents",       label: "Agents",          icon: Users         },
      { href: "/admin/call-center/commissions",  label: "Commissions",     icon: Award         },
    ],
  },
  {
    label: "Livraison",
    groupPrefix: "/admin/delivery",
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

const CC_AGENT_NAV: NavGroup[] = [
  {
    label: null,
    items: [
      { href: "/admin/call-center/my-dashboard", label: "Mon Dashboard",  icon: LayoutDashboard, exact: true  },
      { href: "/admin/call-center/queue",         label: "File d'appels", icon: ListOrdered,     exact: false },
      { href: "/admin/call-center/my-orders",     label: "Mes commandes", icon: ShoppingCart,    exact: false },
      { href: "/admin/call-center/my-earnings",   label: "Mes gains",     icon: Award,           exact: false },
    ],
  },
];

const SCANNER_AGENT_NAV: NavGroup[] = [
  {
    label: null,
    items: [
      { href: "/admin/scanner", label: "Scanner", icon: ScanLine  },
      { href: "/admin/returns", label: "Retours",  icon: RotateCcw },
    ],
  },
];

function getNavForRole(role: AppRole): NavGroup[] {
  if (role === "call_center_agent") return CC_AGENT_NAV;
  if (role === "scanner_agent")     return SCANNER_AGENT_NAV;
  return ADMIN_NAV;
}

export function AdminSidebar({ role }: { role: AppRole }) {
  const pathname  = usePathname();
  const navGroups = getNavForRole(role);

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    if (href === "/admin/delivery") return pathname === "/admin/delivery";
    if (href === "/admin")          return pathname === "/admin";
    if (href === "/admin/call-center") return pathname === "/admin/call-center";
    return pathname.startsWith(href);
  }

  function isGroupActive(prefix?: string) {
    if (!prefix) return false;
    return pathname.startsWith(prefix);
  }

  return (
    <aside className="w-56 shrink-0 border-r bg-card flex flex-col">
      <div className="flex items-center gap-2.5 px-4 py-5 border-b">
        <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center shrink-0">
          <span className="text-primary-foreground font-bold text-xs">GP</span>
        </div>
        <span className="font-semibold text-sm tracking-tight">GestionPro</span>
      </div>

      <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-1">
        {navGroups.map((group, gi) => {
          const groupActive = isGroupActive(group.groupPrefix);
          return (
            <div key={gi} className={cn("space-y-0.5", gi > 0 && "pt-2")}>
              {group.label && (
                <p className={cn(
                  "px-3 py-1 text-[10px] font-bold uppercase tracking-widest",
                  groupActive
                    ? "text-primary"
                    : "text-muted-foreground/60"
                )}>
                  {group.label}
                </p>
              )}
              {group.items.map(({ href, label, icon: Icon, exact }) => {
                const active = isActive(href, exact);
                return (
                  <Link key={href} href={href}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                    )}>
                    <Icon className="h-4 w-4 shrink-0" />
                    {label}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="px-4 py-3 border-t shrink-0">
        <p className="text-xs text-muted-foreground">GestionPro v2.0</p>
      </div>
    </aside>
  );
}