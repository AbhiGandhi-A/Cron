import mongoose from "mongoose";
import { logger } from "./logger";

export interface LimitCheckResult {
  allowed: boolean;
  current: number;
  max: number;
}

export async function checkDailyExecutionLimit(
  userId: mongoose.Types.ObjectId
): Promise<LimitCheckResult> {
  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));

  const user = await mongoose.connection.db!.collection("users").findOne(
    { _id: userId },
    { projection: { maxExecutions: 1 } }
  );

  if (!user) {
    logger.warn("limits", "User not found for execution limit check: " + userId.toString());
    return { allowed: false, current: 0, max: 0 };
  }

  const maxExecutions: number = user.maxExecutions ?? 1000;

  const userJobIds = await mongoose.connection.db!.collection("cronjobs").distinct("_id", { userId });

  const currentDayExecutions = await mongoose.connection.db!.collection("jobexecutions").countDocuments({
    jobId: { $in: userJobIds },
    startedAt: { $gte: dayStart },
    $or: [
      { status: "SUCCESS" },
      { status: "FAILED" },
    ],
  });

  return {
    allowed: currentDayExecutions < maxExecutions,
    current: currentDayExecutions,
    max: maxExecutions,
  };
}
