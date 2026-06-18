import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Public routes — bypass entirely, no Supabase call ──────────────────────
  if (
    pathname.startsWith("/lp/") || pathname === "/lp" ||
    pathname.startsWith("/api/public/") ||
    pathname.startsWith("/api/webhooks/")
  ) {
    // Forward the pathname as a REQUEST header so the root layout can read it
    // via next/headers and set <html lang="ar" dir="rtl"> for landing pages
    // (they're entirely in Arabic) — Next.js doesn't allow a second <html> tag
    // per route group, so this is the supported way to vary it per route.
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-pathname", pathname);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options));
        },
      },
    }
  );

  // Use getSession() — reads from cookie, NO network call → no timeout risk
  // getUser() makes a network request to Supabase on every request → timeout
  const { data: { session } } = await supabase.auth.getSession();
  const isAuthenticated = !!session?.user;

  // ── Protect /admin ─────────────────────────────────────────────────────────
  if (pathname.startsWith("/admin") && !isAuthenticated) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

  // ── /login while authenticated ─────────────────────────────────────────────
  if (pathname === "/login" && isAuthenticated) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!lp(?:/.*)?$|api/public(?:/.*)?$|api/webhooks(?:/.*)?$|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
