import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";

export default auth((request) => {
  const { pathname, search } = request.nextUrl;
  const isAuthenticated = Boolean(request.auth?.user?.id);

  if (pathname.startsWith("/dashboard") && !isAuthenticated) {
    const loginUrl = new URL("/login", request.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthenticated && (pathname === "/login" || pathname === "/register")) {
    return NextResponse.redirect(new URL("/dashboard", request.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  // /forms/* and /api/forms/*/submit stay public. Private form APIs enforce auth themselves.
  matcher: ["/dashboard(.*)", "/login", "/register"],
  runtime: "nodejs",
};
