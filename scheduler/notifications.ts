import { mongoose } from "./database";

export async function sendNotification(config: {
  url: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    await fetch(config.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config.payload),
      redirect: "manual",
      signal: controller.signal,
    });
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const retryController = new AbortController();
    const retryTimeout = setTimeout(() => retryController.abort(), 10000);
    try {
      await fetch(config.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config.payload),
        redirect: "manual",
        signal: retryController.signal,
      });
    } catch {
    } finally {
      clearTimeout(retryTimeout);
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkAndNotify(
  job: {
    _id: string;
    name: string;
    notifications: {
      enabled: boolean;
      url: string;
      failureThreshold: number;
      notifyOnRecovery: boolean;
    };
    consecutiveFailures: number;
  },
  executionStatus: string,
  httpStatus: number | null
): Promise<void> {
  if (!job.notifications?.enabled || !job.notifications.url) {
    return;
  }

  const db = mongoose.connection.db;
  if (!db) {
    return;
  }
  const collection = db.collection("cronjobs");

  const isFailed = httpStatus !== null ? httpStatus >= 400 : executionStatus === "FAILED";

  if (isFailed) {
    const newCount = job.consecutiveFailures + 1;
    await collection.updateOne(
      { _id: new mongoose.Types.ObjectId(job._id) },
      { $set: { consecutiveFailures: newCount } }
    );

    if (newCount >= job.notifications.failureThreshold) {
      try {
        await sendNotification({
          url: job.notifications.url,
          payload: {
            event: "cron_job_failed",
            jobId: job._id,
            jobName: job.name,
            status: httpStatus,
            consecutiveFailures: newCount,
            timestamp: new Date().toISOString(),
          },
        });
      } catch {}
    }
  } else if (job.consecutiveFailures > 0) {
    if (job.notifications.notifyOnRecovery) {
      try {
        await sendNotification({
          url: job.notifications.url,
          payload: {
            event: "cron_job_recovered",
            jobId: job._id,
            jobName: job.name,
            status: httpStatus,
            timestamp: new Date().toISOString(),
          },
        });
      } catch {}
    }

    await collection.updateOne(
      { _id: new mongoose.Types.ObjectId(job._id) },
      { $set: { consecutiveFailures: 0 } }
    );
  }
}
