"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Package, ShoppingCart, PhoneCall,
  Truck, Layers, FileText, FolderOpen,
  ScanLine, RotateCcw, BarChart3, Globe, Settings,
  Shield, Award, Users, ListOrdered, CreditCard, Clapperboard, PackageCheck, Wallet, Calculator, Rocket,
  ChevronDown, Megaphone, Landmark, Menu, X, Boxes, Wand2, Music2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/lib/settings/users-constants";
import { HajtekLogo } from "@/components/brand/logo";

type NavItem = { href: string; label: string; icon: React.ElementType; exact?: boolean };
type NavGroup = { key?: string; label: string | null; icon?: React.ElementType; items: NavItem[] };

// ─── Admin / Manager — regroupé par métier ────────────────────────────────────
const ADMIN_NAV: NavGroup[] = [
  {
    label: null,
    items: [
      { href: "/admin",        label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/admin/orders", label: "Commandes", icon: ShoppingCart },
    ],
  },
  {
    key: "produits", label: "Produits", icon: Boxes,
    items: [
      { href: "/admin/products",          label: "Produits",            icon: Package, exact: true },
      { href: "/admin/products/overview", label: "Vue d'ensemble",      icon: BarChart3 },
      { href: "/admin/products/calculs",  label: "Calculs par produit", icon: Calculator },
    ],
  },
  {
    key: "callcenter", label: "Call Center", icon: PhoneCall,
    items: [
      { href: "/admin/call-center",             label: "Vue globale",   icon: PhoneCall, exact: true },
      { href: "/admin/call-center/queue",       label: "File d'appels", icon: ListOrdered },
      { href: "/admin/call-center/agents",      label: "Agents",        icon: Users },
      { href: "/admin/call-center/commissions", label: "Commissions",   icon: Award },
    ],
  },
  {
    key: "livraison", label: "Livraison", icon: Truck,
    items: [
      { href: "/admin/delivery",          label: "Suivi livraison",    icon: Truck, exact: true },
      { href: "/admin/delivery/daily-bl", label: "BL du jour",         icon: FileText },
      { href: "/admin/delivery/batches",  label: "Tickets impression", icon: Layers },
      { href: "/admin/delivery/notes",    label: "Récap tickets",      icon: FileText },
      { href: "/admin/scanner",           label: "Scanner",            icon: ScanLine },
      { href: "/admin/returns",           label: "Retours",            icon: RotateCcw },
    ],
  },
  {
    key: "documents", label: "Documents", icon: FolderOpen,
    items: [
      { href: "/admin/digylog/documents",  label: "Documents livraison", icon: FolderOpen },
      { href: "/admin/delivery/documents", label: "Documents sync",      icon: FolderOpen },
      { href: "/admin/delivery/invoices",  label: "Factures",            icon: FileText },
    ],
  },
  {
    key: "finance", label: "Finance", icon: Landmark,
    items: [
      { href: "/admin/finance",                label: "Finance",           icon: BarChart3, exact: true },
      { href: "/admin/finance/reconciliation", label: "Réconciliation",    icon: Shield },
      { href: "/admin/profitability",          label: "Rentabilité",       icon: BarChart3 },
      { href: "/admin/expenses",               label: "Dépenses & cartes", icon: CreditCard },
    ],
  },
  {
    key: "marketing", label: "Marketing", icon: Megaphone,
    items: [
      { href: "/admin/ads/stats",     label: "Stats pubs",        icon: BarChart3 },
      { href: "/admin/ads/launch",    label: "Lancer campagne",   icon: Rocket },
      { href: "/admin/ads/rules",     label: "Règles auto pub",   icon: Wand2 },
      { href: "/admin/ads/tiktok",    label: "Dépenses TikTok",   icon: Music2 },
      { href: "/admin/landing-pages", label: "Landing pages",     icon: Globe },
      { href: "/admin/creatives",     label: "Vidéos & éditeurs", icon: Clapperboard },
    ],
  },
  {
    key: "parametres", label: "Paramètres", icon: Settings,
    items: [
      { href: "/admin/settings/ads",                label: "Comptes pub",   icon: Megaphone },
      { href: "/admin/settings/delivery-providers", label: "Transporteurs", icon: Truck },
      { href: "/admin/settings/whatsapp",           label: "WhatsApp",      icon: PhoneCall },
      { href: "/admin/audit-logs",                  label: "Audit logs",    icon: Shield },
      { href: "/admin/settings",                    label: "Paramètres",    icon: Settings, exact: true },
    ],
  },
];

// ─── Call center agent — minimal nav ──────────────────────────────────────────
const CC_AGENT_NAV: NavGroup[] = [
  {
    label: null,
    items: [
      { href: "/admin/call-center/my-dashboard", label: "Mon Dashboard",  icon: LayoutDashboard, exact: true  },
      { href: "/admin/call-center/queue",         label: "File d'appels", icon: ListOrdered,     exact: false },
      { href: "/admin/call-center/my-orders",     label: "Mes commandes", icon: ShoppingCart,    exact: false },
      { href: "/admin/call-center/my-earnings",   label: "Mes gains",     icon: Award,           exact: false },
      { href: "/admin/products",                  label: "Produits",      icon: Package,         exact: true  },
    ],
  },
];

// ─── Scanner agent nav ────────────────────────────────────────────────────────
const SCANNER_AGENT_NAV: NavGroup[] = [
  {
    label: null,
    items: [
      { href: "/admin/scanner", label: "Scanner", icon: ScanLine  },
      { href: "/admin/returns", label: "Retours",  icon: RotateCcw },
    ],
  },
];

// ─── Éditeur vidéo nav ────────────────────────────────────────────────────────
const VIDEO_EDITOR_NAV: NavGroup[] = [
  {
    label: null,
    items: [
      { href: "/admin/editor",          label: "Tableau de bord",   icon: LayoutDashboard, exact: true },
      { href: "/admin/editor/videos",   label: "Mes vidéos",        icon: Clapperboard },
      { href: "/admin/editor/ads",      label: "Stats pubs",        icon: BarChart3 },
      { href: "/admin/editor/deliveries", label: "Suivi livraisons", icon: Truck },
      { href: "/admin/editor/orders",   label: "Commandes livrées", icon: PackageCheck },
      { href: "/admin/editor/payments", label: "Mes paiements",     icon: Wallet },
    ],
  },
];

function getNavForRole(role: AppRole): NavGroup[] {
  if (role === "video_editor")      return VIDEO_EDITOR_NAV;
  if (role === "call_center_agent") return CC_AGENT_NAV;
  if (role === "scanner_agent")     return SCANNER_AGENT_NAV;
  return ADMIN_NAV;
}

const STORE_KEY = "hz.sidebar.open";

export function AdminSidebar({ role }: { role: AppRole }) {
  const pathname  = usePathname();
  const navGroups = getNavForRole(role);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  function isActive(href: string, exact?: boolean) {
    if (href === "/admin") return pathname === "/admin";
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  }
  const groupHasActive = (g: NavGroup) => g.items.some((i) => isActive(i.href, i.exact));

  // Groupes ouverts : mémorisés + le groupe de la page courante toujours ouvert
  useEffect(() => {
    let saved: Record<string, boolean> = {};
    try { saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}"); } catch { /* ignore */ }
    const next = { ...saved };
    for (const g of navGroups) if (g.key && groupHasActive(g)) next[g.key] = true;
    setOpen(next);
    setMobileOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  function toggle(key: string) {
    setOpen((o) => {
      const n = { ...o, [key]: !o[key] };
      try { localStorage.setItem(STORE_KEY, JSON.stringify(n)); } catch { /* ignore */ }
      return n;
    });
  }

  const nav = (
    <>
      <div className="flex items-center justify-between px-4 py-4">
        <Link href="/admin" className="transition-opacity hover:opacity-90"><HajtekLogo /></Link>
        <button onClick={() => setMobileOpen(false)} className="rounded-md p-1.5 text-sidebar-muted hover:bg-sidebar-accent hover:text-white md:hidden" aria-label="Fermer le menu">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="mx-4 h-px bg-gradient-to-r from-transparent via-brand/40 to-transparent" />

      <nav className="scrollbar-thin flex-1 space-y-1 overflow-y-auto px-2.5 py-3">
        {navGroups.map((group, gi) => {
          const collapsible = !!group.key && !!group.label;
          const isOpen = !collapsible || !!open[group.key!];
          const active = groupHasActive(group);
          const GIcon = group.icon;
          return (
            <div key={group.key ?? gi} className={cn(gi > 0 && "pt-1")}>
              {collapsible && (
                <button
                  onClick={() => toggle(group.key!)}
                  className={cn(
                    "group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors",
                    active ? "text-brand" : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-white",
                  )}
                >
                  {GIcon && <GIcon className="h-4 w-4 shrink-0" />}
                  <span className="flex-1 text-left">{group.label}</span>
                  <ChevronDown className={cn("h-4 w-4 shrink-0 opacity-60 transition-transform duration-200", isOpen && "rotate-180")} />
                </button>
              )}
              <div className={cn("grid transition-[grid-template-rows,opacity] duration-300 ease-out", isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
                <div className="overflow-hidden">
                  <div className={cn("space-y-0.5", collapsible && "ml-[18px] mt-0.5 border-l border-white/10 pl-2")}>
                    {group.items.map(({ href, label, icon: Icon, exact }) => {
                      const on = isActive(href, exact);
                      return (
                        <Link key={href} href={href}
                          className={cn(
                            "relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-200",
                            on
                              ? "bg-gradient-to-r from-brand/20 to-brand/5 text-white shadow-[inset_0_0_0_1px_hsl(var(--brand)/0.25)]"
                              : "text-sidebar-muted hover:translate-x-0.5 hover:bg-sidebar-accent hover:text-white",
                          )}>
                          {on && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand" />}
                          <Icon className={cn("h-4 w-4 shrink-0", on ? "text-brand" : "")} />
                          <span className="truncate">{label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-white/10 px-4 py-3">
        <p className="text-[11px] text-sidebar-muted">© HajtekZone · GestionPro v2.1</p>
      </div>
    </>
  );

  return (
    <>
      {/* Bouton menu (mobile) */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-3 top-2.5 z-40 rounded-lg border bg-card p-2 shadow-sm md:hidden"
        aria-label="Ouvrir le menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Sidebar bureau */}
      <aside className="hidden w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">{nav}</aside>

      {/* Tiroir mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 animate-fade-in bg-black/50 backdrop-blur-[2px]" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 animate-slide-in-left flex-col bg-sidebar text-sidebar-foreground shadow-2xl">{nav}</aside>
        </div>
      )}
    </>
  );
}
