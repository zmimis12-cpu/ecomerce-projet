import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Static assets and public routes — pass through immediately
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/public/") ||
    pathname.startsWith("/lp/") ||
    pathname === "/lp" ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Check auth cookie exists (lightweight — no Supabase call)
  const hasSession =
    request.cookies.has("sb-access-token") ||
    request.cookies.has("sb-refresh-token") ||
    [...request.cookies.getAll()].some((c) =>
      c.name.includes("auth-token") || c.name.includes("supabase")
    );

  // Protect /admin — redirect to login if no session cookie
  if (pathname.startsWith("/admin") && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

  // /login while authenticated — redirect to admin
  if (pathname === "/login" && hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
