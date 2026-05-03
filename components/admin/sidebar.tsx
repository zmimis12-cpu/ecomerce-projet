"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Package, ShoppingCart, PhoneCall, Truck, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/admin",              label: "Dashboard",   icon: LayoutDashboard, exact: true },
  { href: "/admin/products",     label: "Produits",    icon: Package,          exact: false },
  { href: "/admin/orders",       label: "Commandes",   icon: ShoppingCart,     exact: false },
  { href: "/admin/call-center",  label: "Call Center", icon: PhoneCall,        exact: false },
  { href: "/admin/delivery",     label: "Livraison",   icon: Truck,            exact: false },
  { href: "/admin/automation",   label: "Automation",  icon: Zap,              exact: false },
];

export function AdminSidebar() {
  const pathname = usePathname();
  function isActive(href: string, exact: boolean) {
    return exact ? pathname === href : pathname.startsWith(href);
  }
  return (
    <aside className="w-56 shrink-0 border-r bg-card flex flex-col">
      <div className="flex items-center gap-2.5 px-4 py-5 border-b">
        <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center shrink-0">
          <span className="text-primary-foreground font-bold text-xs">GP</span>
        </div>
        <span className="font-semibold text-sm tracking-tight">GestionPro</span>
      </div>
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon, exact }) => (
          <Link key={href} href={href} className={cn(
            "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            isActive(href, exact)
              ? "bg-secondary text-foreground"
              : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
          )}>
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="px-4 py-3 border-t">
        <p className="text-xs text-muted-foreground">v2.0</p>
      </div>
    </aside>
  );
}
