import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  enforceRateLimit,
  getAuthenticatedIdentifier,
  getUserIdFromSession,
  logError,
} from "@/lib/security";
import {
  createMailbox,
  getActiveMailbox,
  deleteMailbox,
  isProviderConfigured,
} from "@/lib/temp-mail";
import connectDb from "@/lib/mongodb";
import { User } from "@/lib/models";

export async function POST(req: Request) {
  try {
    const userId = await getUserIdFromSession();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if temp mail is disabled for this user
    await connectDb();
    const user = await User.findById(userId).lean();
    if (user?.tempMailDisabled) {
      return NextResponse.json(
        {
          error: "Temp Mail disabled",
          message: "Temporary Email feature has been disabled for your account by an administrator",
        },
        { status: 403 }
      );
    }

    const limited = enforceRateLimit(`temp-mail:create:${getAuthenticatedIdentifier(userId)}`, 5, 60_000);
    if (limited) return limited;

    if (!(await isProviderConfigured())) {
      return NextResponse.json(
        { error: "Email receiving is not configured" },
        { status: 503 }
      );
    }

    const result = await createMailbox(userId);

    return NextResponse.json({ ...result, configured: true }, { status: 201 });
  } catch (error) {
    logError("temp-mail-create", "Failed to create mailbox", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const userId = await getUserIdFromSession();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const limited = enforceRateLimit(`temp-mail:get:${getAuthenticatedIdentifier(userId)}`, 30, 60_000);
    if (limited) return limited;

    const configured = await isProviderConfigured();
    const mailbox = await getActiveMailbox(userId);

    if (!mailbox) {
      return NextResponse.json({ mailbox: null, configured });
    }

    return NextResponse.json({ mailbox, configured });
  } catch (error) {
    logError("temp-mail-get", "Failed to get mailbox", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const userId = await getUserIdFromSession();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const limited = enforceRateLimit(`temp-mail:delete:${getAuthenticatedIdentifier(userId)}`, 10, 60_000);
    if (limited) return limited;

    const deleted = await deleteMailbox(userId);

    return NextResponse.json({ deleted });
  } catch (error) {
    logError("temp-mail-delete", "Failed to delete mailbox", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
