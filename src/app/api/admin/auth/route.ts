import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAuthHeader, getClientIp, validateAdminCredentials } from "@/lib/admin-auth";
import connectDb from "@/lib/mongodb";
import { AdminAuditLog } from "@/lib/models";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { username, password } = body as { username?: string; password?: string };

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password required" },
        { status: 400 }
      );
    }

    const isValid = validateAdminCredentials(username, password);

    if (!isValid) {
      // Log failed attempt
      await connectDb();
      await AdminAuditLog.create({
        action: "admin_login",
        adminIp: getClientIp(req),
        targetUserId: null,
        targetUserEmail: null,
        details: { username },
        success: false,
        errorMessage: "Invalid credentials",
      }).catch(() => {});

      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    // Log successful login
    await connectDb();
    await AdminAuditLog.create({
      action: "admin_login",
      adminIp: getClientIp(req),
      targetUserId: null,
      targetUserEmail: null,
      details: { username },
      success: true,
      errorMessage: null,
    }).catch(() => {});

    // Generate basic auth header for subsequent requests
    const credentials = `${username}:${password}`;
    const encodedCredentials = Buffer.from(credentials).toString("base64");

    return NextResponse.json(
      {
        success: true,
        message: "Admin login successful",
        authToken: `Bearer ${encodedCredentials}`,
        expiresIn: "8h",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Admin login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  // Check if already authenticated
  const authHeader = req.headers.get("authorization");
  const auth = verifyAdminAuthHeader(authHeader);

  if (!auth.isAdmin) {
    return NextResponse.json(
      { error: "Unauthorized", authenticated: false },
      { status: 401 }
    );
  }

  return NextResponse.json({
    authenticated: true,
    message: "Admin session valid",
  });
}
