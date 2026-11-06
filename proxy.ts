import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, adminCookieOptions, adminKeyExchange } from "@/lib/curator";

// Swap ?key=ADMIN_KEY for the /admin cookie (lib/curator.ts). On /admin pages the key also leaves
// the URL: a 303 to the same path and query without it. Next sends a same-origin redirect's
// Location as a relative URL (router-utils/resolve-routes), so behind the gurmukhi-search shell's
// rewrite the browser stays on the shell's host.
export function proxy(request: NextRequest) {
  const { setCookie, redirectTo } = adminKeyExchange(request.nextUrl.pathname, request.nextUrl.searchParams);
  if (!setCookie) return NextResponse.next();
  const response = redirectTo ? NextResponse.redirect(new URL(redirectTo, request.url), 303) : NextResponse.next();
  response.cookies.set(ADMIN_COOKIE, request.nextUrl.searchParams.get("key")!, adminCookieOptions());
  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/word/:path*"],
};
