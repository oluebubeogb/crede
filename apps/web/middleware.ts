import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Protect all app routes when the user is not signed in.
 * Public: /, /login, /for-recruiters, /u/* (public profiles).
 * Everything else (dashboard, generate, recruiter, settings, etc.) requires
 * the access_token cookie and is redirected to /login?next=...
 */
const PUBLIC_PATHS = new Set(["/", "/login", "/for-recruiters"]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  // Public profile pages
  if (pathname.startsWith("/u/")) return true;
  // Static / Next internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/backend")
  ) {
    return true;
  }
  return false;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get("access_token")?.value;
  if (!token) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except static assets and API proxy.
     * Middleware still runs for pages; isPublic() skips the rest.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
