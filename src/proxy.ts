// middleware.ts (root of your Next.js project)
import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { isMarketingContext } from "@/lib/rbac";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const { pathname } = req.nextUrl;

    const role = token?.role as string | undefined;
    const team_type = token?.team_type as string | null | undefined;

    // ─── CLIENT: can only access /client + /api/client + /api/auth ───────────
    if (role === "CLIENT") {
      const allowed =
        pathname.startsWith("/client") ||
        pathname.startsWith("/api/client") ||
        pathname.startsWith("/api/auth");

      if (!allowed) {
        return NextResponse.redirect(new URL("/client", req.url));
      }

      // Allow and stop checking further rules
      return NextResponse.next();
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ─── Non-CLIENT staff: block access to /client pages ─────────────────────
    if (pathname.startsWith("/client")) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ─── ATTENDANCE_MANAGER: can only access /attendance + its API ───────────
    if (role === "ATTENDANCE_MANAGER") {
      const allowed =
        pathname.startsWith("/attendance") ||
        pathname.startsWith("/api/attendance");

      if (!allowed) {
        return NextResponse.redirect(new URL("/attendance", req.url));
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ─── /leads pages: only ADMIN, PROJECT_MANAGER, or marketing context ─────
    if (pathname.startsWith("/leads")) {
      const allowed =
        role === "ADMIN" ||
        role === "PROJECT_MANAGER" ||
        isMarketingContext(role ?? "", team_type);

      if (!allowed) {
        return NextResponse.redirect(new URL("/", req.url));
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => Boolean(token),
    },
  },
);

export const config = {
  matcher: [
    "/((?!api|_next|login|favicon.ico|.*\\.webp|.*\\.png|.*\\.jpg|.*\\.jpeg|.*\\.svg|.*\\.gif|.*\\.ico|.*\\.js|.*\\.css|.*\\.woff2|.*\\.woff|.*\\.ttf).*)",
  ],
};
