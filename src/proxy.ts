import { NextResponse, type NextRequest } from "next/server";
import { isAuthConfigured, neonAuth } from "@/lib/neon-auth";

let middleware: ((request: NextRequest) => Promise<NextResponse>) | undefined;

// Signed-out visitors of /admin go to the login page; Neon Auth also refreshes
// the session cookie here. Pages and actions still check the staff row.
export default function proxy(request: NextRequest) {
  if (!isAuthConfigured) {
    return request.nextUrl.pathname === "/admin/login" ? NextResponse.next() : NextResponse.redirect(new URL("/admin/login", request.url));
  }
  middleware ??= neonAuth().middleware({ loginUrl: "/admin/login", publicRoutes: ["/admin/login"] });
  return middleware(request);
}

export const config = {
  matcher: ["/admin/:path*"],
};
