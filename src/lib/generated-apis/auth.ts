import type { IGeneratedApi } from "@/lib/models";
import { auditSecretCompare } from "./helpers";

export interface PrivateTokenLike {
  id?: string | null;
  sub?: string | null;
}

export interface VerifyAuthOptions {
  resolvePrivateToken?: () => Promise<PrivateTokenLike | null>;
}

function timingSafeEqualStrings(expected: string, provided: string): boolean {
  return auditSecretCompare(expected, provided);
}

export async function verifyApiAuth(
  api: IGeneratedApi,
  req: Request,
  options: VerifyAuthOptions = {}
): Promise<boolean> {
  const mode = api.auth?.mode ?? "public";

  if (mode === "public") return true;

  if (mode === "api-key") {
    const key = req.headers.get("x-api-key");
    if (!key) return false;
    return timingSafeEqualStrings(api.auth.secretHash ?? "", key);
  }

  if (mode === "bearer") {
    const authorization = req.headers.get("authorization") || "";
    const match = authorization.match(/^Bearer\s+(\S+)$/iu);
    if (!match) return false;
    return timingSafeEqualStrings(api.auth.secretHash ?? "", match[1]);
  }

  if (mode === "private") {
    const resolver = options.resolvePrivateToken;
    if (!resolver) return false;
    try {
      const token = await resolver();
      if (!token) return false;
      const id = token.id ?? token.sub ?? null;
      if (!id) return false;
      return id === api.userId.toString();
    } catch {
      return false;
    }
  }

  return false;
}