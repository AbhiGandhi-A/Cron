import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDb from "@/lib/mongodb";
import { SchedulerHeartbeat } from "@/lib/models";
import { logError, enforceRateLimit, getClientIdentifier } from "@/lib/security";
import crypto from "node:crypto";

const SCHEDULER_API_TOKEN = process.env.SCHEDULER_API_TOKEN || "";

function verifySchedulerToken(req: Request): boolean {
  if (!SCHEDULER_API_TOKEN) return false;
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7);
  if (token.length !== SCHEDULER_API_TOKEN.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(token),
    Buffer.from(SCHEDULER_API_TOKEN)
  );
}

async function getUserId(req: Request): Promise<string | null> {
  if (verifySchedulerToken(req)) return "__scheduler__";
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return (session.user as { id: string }).id;
}

export async function GET(req: Request) {
  try {
    const ip = getClientIdentifier(req);
    const limited = enforceRateLimit(`scheduler-status:${ip}`, 30, 60_000);
    if (limited) return limited;

    const userId = await getUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDb();

    const heartbeat = await SchedulerHeartbeat.findById("scheduler").lean();

    const now = new Date();
    const isOnline =
      heartbeat?.status === "ONLINE" &&
      heartbeat.lastHeartbeat &&
      now.getTime() - new Date(heartbeat.lastHeartbeat).getTime() < 90000;

    return NextResponse.json({
      online: isOnline,
      heartbeat: heartbeat
        ? {
            status: heartbeat.status,
            lastHeartbeat: heartbeat.lastHeartbeat,
            jobsProcessed: heartbeat.jobsProcessed,
            lastExecutionAt: heartbeat.lastExecutionAt,
            startedAt: heartbeat.startedAt,
          }
        : null,
    });
  } catch (error) {
    logError("scheduler-status", "Failed to get scheduler status", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
