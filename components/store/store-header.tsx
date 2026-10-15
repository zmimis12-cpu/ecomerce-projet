"use client";
/**
 * En-tête de la boutique HajtekZone (RTL) : logo + menu latéral avec tous
 * les produits. Utilisé sur la page d'accueil et sur chaque page produit.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X, Home, ShieldCheck, Truck, Info, FileText, ShoppingBag, Mail } from "lucide-react";
import { HajtekLogo } from "@/components/brand/logo";

export type HeaderProduct = { slug: string; title: string; image: string | null; price: number };

export function StoreHeader({ announcement }: { products?: HeaderProduct[]; current?: string; announcement?: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      <header dir="rtl" className="sticky top-0 z-40 border-b border-black/5 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-3">
          <button onClick={() => setOpen(true)} aria-label="القائمة"
            className="flex items-center gap-1.5 rounded-full bg-neutral-900 px-3 py-1.5 text-[13px] font-bold text-white shadow-sm active:scale-95">
            <Menu className="h-4 w-4" /> القائمة
          </button>
          <Link href="/" aria-label="HajtekZone" dir="ltr"><HajtekLogo tone="light" sub={null} /></Link>
        </div>
        <div className="flex items-center justify-center gap-4 bg-neutral-900 px-3 py-1.5 text-center text-[11px] font-semibold text-[#F3D98B]">
          {announcement?.trim() ? <span>{announcement}</span> : (
            <>
              <span className="flex items-center gap-1"><Truck className="h-3.5 w-3.5" /> توصيل لجميع المدن</span>
              <span className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> الدفع عند الاستلام</span>
            </>
          )}
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-[60]" dir="rtl">
          <div className="absolute inset-0 animate-fade-in bg-black/50 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 right-0 flex w-[86%] max-w-sm flex-col bg-white shadow-2xl [animation:hzSlideR_.25s_ease-out_both]">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span dir="ltr"><HajtekLogo tone="light" sub={null} /></span>
              <button onClick={() => setOpen(false)} aria-label="إغلاق" className="rounded-full p-2 hover:bg-neutral-100"><X className="h-5 w-5" /></button>
            </div>
            <nav className="flex-1 overflow-y-auto p-3">
              <Link href="/" className="mb-2 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold hover:bg-neutral-100"><Home className="h-4 w-4" /> الرئيسية</Link>
              <Link href="/#products" onClick={() => setOpen(false)} className="mb-2 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold hover:bg-neutral-100"><ShoppingBag className="h-4 w-4" /> جميع المنتجات</Link>
              <a href="mailto:contact@hajtek.ma" className="mb-2 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold hover:bg-neutral-100"><Mail className="h-4 w-4" /> تواصل معنا</a>
              <div className="mt-4 space-y-1 border-t pt-3 text-sm">
                <Link href="/a-propos" className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-neutral-100"><Info className="h-4 w-4" /> من نحن</Link>
                <Link href="/conditions" className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-neutral-100"><FileText className="h-4 w-4" /> شروط البيع والاسترجاع</Link>
                <Link href="/confidentialite" className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-neutral-100"><ShieldCheck className="h-4 w-4" /> سياسة الخصوصية</Link>
              </div>
            </nav>
          </aside>
        </div>
      )}
      <style>{`@keyframes hzSlideR{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>
    </>
  );
}
