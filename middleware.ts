import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// The public-facing domain for landing pages (set this in Vercel env vars).
// When a request arrives on this domain, the middleware:
//   1. Rewrites /slug → /lp/slug so the existing landing page route handles it
//   2. Blocks /admin entirely — visitors on hajtek.ma cannot access the backend
//   3. Blocks /login — no login page exposed on the public domain
// The admin stays accessible only on the Vercel deployment URL (ecomerce-projet.vercel.app)
const PUBLIC_DOMAIN = (process.env.NEXT_PUBLIC_LP_DOMAIN ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "");

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") ?? "";
  const isPublicDomain = PUBLIC_DOMAIN.length > 0 && (host === PUBLIC_DOMAIN || host === `www.${PUBLIC_DOMAIN}`);

  // ── Public domain (hajtek.ma) ───────────────────────────────────────────────
  if (isPublicDomain) {
    // Block ANY access to admin/login/api (except public order API) from the
    // public domain — client cannot reach the backend even if they type the URL
    if (
      pathname.startsWith("/admin") ||
      pathname === "/login" ||
      (pathname.startsWith("/api/") &&
        !pathname.startsWith("/api/public/") &&
        !pathname.startsWith("/api/webhooks/"))
    ) {
      // Return a plain 404, not a redirect — don't reveal that /admin exists
      return new NextResponse(null, { status: 404 });
    }

    // Rewrite /slug → /lp/slug so the existing page route handles it
    // hajtek.ma/foam-cleaner → /lp/foam-cleaner (internally)
    // Exclude Next.js internals and static assets
    if (
      pathname !== "/" &&
      !pathname.startsWith("/lp/") &&
      !pathname.startsWith("/_next/") &&
      !pathname.startsWith("/api/") &&
      !pathname.match(/\.(ico|png|jpg|jpeg|gif|svg|webp|css|js|woff2?)$/)
    ) {
      const url = request.nextUrl.clone();
      url.pathname = `/lp${pathname}`;
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set("x-pathname", url.pathname);
      requestHeaders.set("x-public-domain", "1");
      const res = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
      // Security headers
      res.headers.set("X-Frame-Options", "DENY");
      res.headers.set("X-Content-Type-Options", "nosniff");
      res.headers.set("Referrer-Policy", "no-referrer");
      res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
      return res;
    }

    // Root of public domain → show a neutral page (not admin redirect)
    if (pathname === "/") {
      const url = request.nextUrl.clone();
      url.pathname = "/lp";
      return NextResponse.rewrite(url);
    }
  }

  // ── Public routes on admin domain — bypass entirely, no Supabase call ───────
  if (
    pathname.startsWith("/lp/") || pathname === "/lp" ||
    pathname.startsWith("/api/public/") ||
    pathname.startsWith("/api/webhooks/")
  ) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-pathname", pathname);
    const res = NextResponse.next({ request: { headers: requestHeaders } });

    if (pathname.startsWith("/lp/")) {
      res.headers.set("X-Frame-Options", "DENY");
      res.headers.set("X-Content-Type-Options", "nosniff");
      res.headers.set("Referrer-Policy", "no-referrer");
      res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    }

    return res;
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
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|woff2?)$).*)",
  ],
};
