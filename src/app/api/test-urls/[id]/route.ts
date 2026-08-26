import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDb from "@/lib/mongodb";
import { TestUrl, TestUrlRequest } from "@/lib/models";
import { enforceRateLimit, getAuthenticatedIdentifier, logError, validateObjectId } from "@/lib/security";

async function getUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return (session.user as { id: string }).id;
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const limited = enforceRateLimit(`test-urls:delete:${getAuthenticatedIdentifier(userId)}`, 20, 60_000);
    if (limited) return limited;

    await connectDb();

    const { id } = await params;
    if (!validateObjectId(id)) {
      return NextResponse.json({ error: "Invalid test URL ID" }, { status: 400 });
    }

    const existing = await TestUrl.findOne({ _id: id, userId }).lean();

    if (!existing) {
      return NextResponse.json({ error: "Test URL not found" }, { status: 404 });
    }

    await Promise.all([
      TestUrl.findByIdAndDelete(id),
      TestUrlRequest.deleteMany({ testUrlId: id }),
    ]);

    return NextResponse.json({ message: "Test URL deleted" });
  } catch (error) {
    logError("test-urls-delete", "Failed to delete test URL", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
