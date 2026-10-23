import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Protect all app routes when the user is not signed in.
 * Public: /, /login, /for-recruiters, /u/* (public profiles), /p/* (shared posts), PWA files.
 * Signed-in visitors to / are sent to /feed.
 * Everything else (dashboard, generate, recruiter, settings, etc.) requires
 * the access_token cookie and is redirected to /login?next=...
 */
const PUBLIC_PATHS = new Set(["/", "/login", "/for-recruiters", "/offline", "/sw.js", "/manifest.webmanifest", "/robots.txt"]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  // Public profile pages
  if (pathname.startsWith("/u/")) return true;
  if (pathname.startsWith("/p/")) return true;
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

  const token = request.cookies.get("access_token")?.value;

  // Signed-in users land on the community feed
  if (pathname === "/" && token) {
    const url = request.nextUrl.clone();
    url.pathname = "/feed";
    return NextResponse.redirect(url);
  }

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

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
