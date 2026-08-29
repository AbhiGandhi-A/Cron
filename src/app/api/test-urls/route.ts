import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDb from "@/lib/mongodb";
import { TestUrl, TestUrlRequest } from "@/lib/models";
import { enforceRateLimit, getAuthenticatedIdentifier, logError, readJsonBody } from "@/lib/security";
import { mergeRequestCounts } from "@/lib/test-urls/view";
import crypto from "node:crypto";

async function getUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return (session.user as { id: string }).id;
}

export async function GET() {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const limited = enforceRateLimit(`test-urls:list:${getAuthenticatedIdentifier(userId)}`, 30, 60_000);
    if (limited) return limited;

    await connectDb();

    const testUrls = await TestUrl.find({ userId })
      .select("token name isActive createdAt")
      .sort({ createdAt: -1 })
      .lean();

    const counts = await TestUrlRequest.aggregate<{ _id: unknown; count: number }>([
      { $group: { _id: "$testUrlId", count: { $sum: 1 } } },
    ]);

    return NextResponse.json({ testUrls: mergeRequestCounts(testUrls, counts) });
  } catch (error) {
    logError("test-urls-list", "Failed to list test URLs", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimited = enforceRateLimit(`test-urls:create:${getAuthenticatedIdentifier(userId)}`, 20, 60_000);
    if (rateLimited) return rateLimited;

    await connectDb();

    const body = await readJsonBody(req, 1024);

    if (!body?.name || typeof body.name !== "string") {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    const name = body.name.trim();
    if (name.length === 0 || name.length > 255) {
      return NextResponse.json(
        { error: "Name must be between 1 and 255 characters" },
        { status: 400 }
      );
    }

    const token = crypto.randomBytes(32).toString("hex");

    const testUrl = await TestUrl.create({
      userId,
      name,
      token,
    });

    return NextResponse.json({ testUrl }, { status: 201 });
  } catch (error) {
    logError("test-urls-create", "Failed to create test URL", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
