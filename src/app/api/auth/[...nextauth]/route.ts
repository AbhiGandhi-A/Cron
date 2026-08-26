import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";
import { enforceRateLimit, getClientIdentifier } from "@/lib/security";

const handler = NextAuth(authOptions);

async function rateLimitedHandler(
  req: Request,
  ctx: { params: Promise<{ nextauth: string[] }> }
) {
  const url = new URL(req.url);
  const isCredentialsLogin =
    req.method === "POST" && url.pathname.includes("/callback/credentials");

  if (isCredentialsLogin) {
    const ip = getClientIdentifier(req);
    const limited = enforceRateLimit("login:" + ip, 10, 60_000);
    if (limited) return limited;
  }

  return handler(req, ctx);
}

export { rateLimitedHandler as GET, rateLimitedHandler as POST };
