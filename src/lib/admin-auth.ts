/**
 * Admin authentication utilities
 * Uses simple HTTP Basic Auth style with environment variables
 * ADMIN_USERNAME and ADMIN_PASSWORD must be set in environment
 */

import { NextRequest, NextResponse } from "next/server";

export interface AdminAuthResult {
  isAdmin: boolean;
  error?: string;
}

/**
 * Check if admin credentials are valid
 * Compares provided username and password against environment variables
 */
export function validateAdminCredentials(
  providedUsername: string,
  providedPassword: string
): boolean {
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminUsername || !adminPassword) {
    return false;
  }

  // Use timing-safe comparison to prevent timing attacks
  return (
    timingSafeStringEqual(providedUsername, adminUsername) &&
    timingSafeStringEqual(providedPassword, adminPassword)
  );
}

/**
 * Timing-safe string comparison
 * Prevents timing attacks by comparing all characters even if mismatch found early
 */
function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Verify admin credentials from request
 * Checks for Authorization header with Bearer token (JWT-like admin token)
 * For simplicity, we encode credentials in a format: base64(username:password)
 */
export function verifyAdminAuthHeader(
  authHeader: string | null
): AdminAuthResult {
  if (!authHeader) {
    return { isAdmin: false, error: "Missing authorization header" };
  }

  // Support "Bearer <base64-encoded-credentials>"
  if (authHeader.startsWith("Bearer ")) {
    const encoded = authHeader.slice(7);
    try {
      const decoded = Buffer.from(encoded, "base64").toString("utf-8");
      const [username, password] = decoded.split(":");

      if (!username || !password) {
        return { isAdmin: false, error: "Invalid credential format" };
      }

      if (validateAdminCredentials(username, password)) {
        return { isAdmin: true };
      }

      return { isAdmin: false, error: "Invalid credentials" };
    } catch {
      return { isAdmin: false, error: "Invalid encoding" };
    }
  }

  // Support "Basic <base64-encoded-credentials>"
  if (authHeader.startsWith("Basic ")) {
    const encoded = authHeader.slice(6);
    try {
      const decoded = Buffer.from(encoded, "base64").toString("utf-8");
      const [username, password] = decoded.split(":");

      if (!username || !password) {
        return { isAdmin: false, error: "Invalid credential format" };
      }

      if (validateAdminCredentials(username, password)) {
        return { isAdmin: true };
      }

      return { isAdmin: false, error: "Invalid credentials" };
    } catch {
      return { isAdmin: false, error: "Invalid encoding" };
    }
  }

  return { isAdmin: false, error: "Unsupported authentication method" };
}

/**
 * Middleware to protect admin API routes
 * Returns 401 if credentials are invalid
 */
export function requireAdminAuth(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const auth = verifyAdminAuthHeader(authHeader);

  if (!auth.isAdmin) {
    return NextResponse.json(
      { error: auth.error || "Unauthorized" },
      { status: 401 }
    );
  }

  // Auth successful - return null to allow request to continue
  return null;
}

/**
 * Get client IP address from request
 */
export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";
  return ip;
}
