import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withAuth } from "next-auth/middleware";

const securityHeaders: Record<string, string> = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "font-src 'self' data:",
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join("; "),
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-XSS-Protection": "0",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
};

const devSecurityHeaders: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Cross-Origin-Opener-Policy": "same-origin",
};

export default withAuth(
  function middleware(req: NextRequest) {
    const response = NextResponse.next();

    if (process.env.NODE_ENV === "production") {
      Object.entries(securityHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
    } else {
      Object.entries(devSecurityHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
    }

    return response;
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl;
        const publicPages = [
          "/about",
          "/contact",
          "/privacy",
          "/terms",
          "/cookie-policy",
          "/ads.txt",
          "/robots.txt",
          "/sitemap.xml",
        ];
        const isPublic =
          pathname === "/" ||
          pathname === "/auth/login" ||
          pathname === "/auth/register" ||
          publicPages.some(
            (p) => pathname === p || pathname.startsWith(p + "/")
          );
        if (isPublic) return true;
        return !!token;
      },
    },
    pages: {
      signIn: "/auth/login",
    },
  }
);

export const config = {
  matcher: [
    "/((?!auth|api/auth|api/test|api/public|api/temp-mail/webhook|_next/static|_next/image|favicon.ico).*)",
  ],
};
