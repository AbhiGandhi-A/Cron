import mongoose from "mongoose";
import connectDb from "@/lib/mongodb";
import { TemporaryMailbox, TemporaryEmail, User } from "@/lib/models";
import { getCloudflareConfigFromEnv } from "@/lib/cloudflare-config";

export interface TempMailAggregateStats {
  mailboxes: {
    total: number;
    active: number;
    expired: number;
    deleted: number;
    createdToday: number;
  };
  emails: {
    total: number;
    createdToday: number;
  };
  storage: {
    totalBytes: number;
    averageEmailSize: number;
  };
  source: "d1" | "mongodb" | "hybrid";
}

function safeNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

interface D1QueryResult<T = Record<string, unknown>> {
  result?: Array<{
    results?: T[];
    success?: boolean;
  }>;
  success?: boolean;
  errors?: Array<{ code: number; message: string }>;
}

/**
 * Execute a parameterized query against Cloudflare D1 via Cloudflare REST API.
 */
async function queryD1<T = Record<string, unknown>>(
  sql: string,
  params: (string | number | boolean | null)[] = []
): Promise<T[]> {
  const { accountId, d1DatabaseId, apiToken } = getCloudflareConfigFromEnv();

  if (!accountId || !d1DatabaseId || !apiToken) {
    return [];
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(
    accountId
  )}/d1/database/${encodeURIComponent(d1DatabaseId)}/query`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      return [];
    }

    const data = (await res.json()) as D1QueryResult<T>;
    if (!data.success || !Array.isArray(data.result) || data.result.length === 0) {
      return [];
    }

    return data.result[0]?.results || [];
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch real-time temp mail statistics by combining Cloudflare D1 and MongoDB data.
 */
export async function getRealtimeTempMailStats(): Promise<TempMailAggregateStats> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayIso = today.toISOString();

  // 1. Query MongoDB stats
  let mongoStats = {
    totalMailboxes: 0,
    activeMailboxes: 0,
    expiredMailboxes: 0,
    deletedMailboxes: 0,
    mailboxesToday: 0,
    totalEmails: 0,
    emailsToday: 0,
    totalBytes: 0,
    avgBytes: 0,
  };

  try {
    await connectDb();

    const [
      totalMailboxes,
      activeMailboxes,
      expiredMailboxes,
      deletedMailboxes,
      mailboxesToday,
      totalEmails,
      emailsToday,
      emailAggregate,
    ] = await Promise.all([
      TemporaryMailbox.countDocuments(),
      TemporaryMailbox.countDocuments({ status: "active" }),
      TemporaryMailbox.countDocuments({ status: "expired" }),
      TemporaryMailbox.countDocuments({ status: "deleted" }),
      TemporaryMailbox.countDocuments({
        createdAt: { $gte: today },
        status: { $ne: "deleted" },
      }),
      TemporaryEmail.countDocuments(),
      TemporaryEmail.countDocuments({ createdAt: { $gte: today } }),
      TemporaryEmail.aggregate([
        {
          $group: {
            _id: null,
            totalSize: { $sum: "$size" },
            avgSize: { $avg: "$size" },
          },
        },
      ]),
    ]);

    mongoStats = {
      totalMailboxes: safeNumber(totalMailboxes),
      activeMailboxes: safeNumber(activeMailboxes),
      expiredMailboxes: safeNumber(expiredMailboxes),
      deletedMailboxes: safeNumber(deletedMailboxes),
      mailboxesToday: safeNumber(mailboxesToday),
      totalEmails: safeNumber(totalEmails),
      emailsToday: safeNumber(emailsToday),
      totalBytes: safeNumber(emailAggregate[0]?.totalSize),
      avgBytes: safeNumber(emailAggregate[0]?.avgSize),
    };
  } catch {
    // Mongo fallback if unavailable
  }

  // 2. Query Cloudflare D1 stats
  let d1Stats: {
    total_mailboxes?: number;
    active_mailboxes?: number;
    expired_mailboxes?: number;
    deleted_mailboxes?: number;
    mailboxes_today?: number;
    total_emails?: number;
    emails_today?: number;
    total_bytes?: number;
    avg_bytes?: number;
  } | null = null;

  try {
    const d1Sql = `
      SELECT 
        (SELECT COUNT(*) FROM mailboxes) AS total_mailboxes,
        (SELECT COUNT(*) FROM mailboxes WHERE status = 'active') AS active_mailboxes,
        (SELECT COUNT(*) FROM mailboxes WHERE status = 'expired') AS expired_mailboxes,
        (SELECT COUNT(*) FROM mailboxes WHERE status = 'deleted') AS deleted_mailboxes,
        (SELECT COUNT(*) FROM mailboxes WHERE created_at >= ?1) AS mailboxes_today,
        (SELECT COUNT(*) FROM emails) AS total_emails,
        (SELECT COUNT(*) FROM emails WHERE received_at >= ?1) AS emails_today,
        (SELECT COALESCE(SUM(size), 0) FROM emails) AS total_bytes,
        (SELECT COALESCE(AVG(size), 0) FROM emails) AS avg_bytes;
    `;

    const results = await queryD1<{
      total_mailboxes: number;
      active_mailboxes: number;
      expired_mailboxes: number;
      deleted_mailboxes: number;
      mailboxes_today: number;
      total_emails: number;
      emails_today: number;
      total_bytes: number;
      avg_bytes: number;
    }>(d1Sql, [todayIso]);

    if (results.length > 0 && results[0]) {
      d1Stats = results[0];
    }
  } catch {
    // D1 fallback
  }

  // 3. Merge Cloudflare D1 + MongoDB stats
  const d1TotalMb = safeNumber(d1Stats?.total_mailboxes);
  const d1ActiveMb = safeNumber(d1Stats?.active_mailboxes);
  const d1ExpiredMb = safeNumber(d1Stats?.expired_mailboxes);
  const d1DeletedMb = safeNumber(d1Stats?.deleted_mailboxes);
  const d1MbToday = safeNumber(d1Stats?.mailboxes_today);

  const d1TotalEm = safeNumber(d1Stats?.total_emails);
  const d1EmToday = safeNumber(d1Stats?.emails_today);
  const d1TotalBytes = safeNumber(d1Stats?.total_bytes);

  const totalMailboxes = d1TotalMb + mongoStats.totalMailboxes;
  const activeMailboxes = d1ActiveMb + mongoStats.activeMailboxes;
  const expiredMailboxes = d1ExpiredMb + mongoStats.expiredMailboxes;
  const deletedMailboxes = d1DeletedMb + mongoStats.deletedMailboxes;
  const mailboxesToday = d1MbToday + mongoStats.mailboxesToday;

  const totalEmails = d1TotalEm + mongoStats.totalEmails;
  const emailsToday = d1EmToday + mongoStats.emailsToday;
  const totalBytes = d1TotalBytes + mongoStats.totalBytes;
  const averageEmailSize = totalEmails > 0 ? totalBytes / totalEmails : 0;

  const source: "d1" | "mongodb" | "hybrid" =
    d1Stats && mongoStats.totalMailboxes > 0
      ? "hybrid"
      : d1Stats
      ? "d1"
      : "mongodb";

  return {
    mailboxes: {
      total: totalMailboxes,
      active: activeMailboxes,
      expired: expiredMailboxes,
      deleted: deletedMailboxes,
      createdToday: mailboxesToday,
    },
    emails: {
      total: totalEmails,
      createdToday: emailsToday,
    },
    storage: {
      totalBytes,
      averageEmailSize,
    },
    source,
  };
}

/**
 * Fetch real-time temp mail stats for a single user (by ownerId).
 */
export async function getUserTempMailStats(
  ownerId: string
): Promise<{ mailboxes: number; emails: number }> {
  let d1Mailboxes = 0;
  let d1Emails = 0;

  try {
    const d1Sql = `
      SELECT 
        (SELECT COUNT(*) FROM mailboxes WHERE owner_id = ?1 AND status = 'active') AS active_mailboxes,
        (SELECT COUNT(*) FROM emails WHERE mailbox_id IN (SELECT id FROM mailboxes WHERE owner_id = ?1)) AS email_count;
    `;
    const results = await queryD1<{
      active_mailboxes: number;
      email_count: number;
    }>(d1Sql, [ownerId]);

    if (results.length > 0 && results[0]) {
      d1Mailboxes = safeNumber(results[0].active_mailboxes);
      d1Emails = safeNumber(results[0].email_count);
    }
  } catch {
    // D1 fallback
  }

  let mongoMailboxes = 0;
  let mongoEmails = 0;

  try {
    await connectDb();
    const mailboxes = await TemporaryMailbox.find({
      ownerId,
      status: "active",
    }).lean();
    mongoMailboxes = mailboxes.length;
    const mailboxIds = mailboxes.map((m) => m._id);
    mongoEmails = await TemporaryEmail.countDocuments({
      mailboxId: { $in: mailboxIds },
    });
  } catch {
    // Mongo fallback
  }

  return {
    mailboxes: d1Mailboxes + mongoMailboxes,
    emails: d1Emails + mongoEmails,
  };
}

/**
 * Fetch real-time temp mail counts for multiple users in batch (for User management table).
 */
export async function getBatchUsersTempMailStats(
  ownerIds: string[]
): Promise<Record<string, { mailboxes: number; emails: number }>> {
  const result: Record<string, { mailboxes: number; emails: number }> = {};
  for (const id of ownerIds) {
    result[id] = { mailboxes: 0, emails: 0 };
  }

  if (ownerIds.length === 0) return result;

  // 1. Query Cloudflare D1
  try {
    const d1Sql = `
      SELECT 
        m.owner_id,
        COUNT(DISTINCT m.id) AS mailbox_count,
        COUNT(e.id) AS email_count
      FROM mailboxes m
      LEFT JOIN emails e ON e.mailbox_id = m.id
      WHERE m.status = 'active'
      GROUP BY m.owner_id;
    `;
    const rows = await queryD1<{
      owner_id: string;
      mailbox_count: number;
      email_count: number;
    }>(d1Sql);

    for (const row of rows) {
      if (row.owner_id && result[row.owner_id]) {
        result[row.owner_id] = {
          mailboxes: safeNumber(row.mailbox_count),
          emails: safeNumber(row.email_count),
        };
      }
    }
  } catch {
    // D1 fallback
  }

  // 2. Query MongoDB
  try {
    await connectDb();
    const mailboxCounts = await TemporaryMailbox.aggregate([
      {
        $match: {
          ownerId: { $in: ownerIds },
          status: "active",
        },
      },
      {
        $group: {
          _id: "$ownerId",
          count: { $sum: 1 },
          mailboxIds: { $push: "$_id" },
        },
      },
    ]);

    for (const item of mailboxCounts) {
      const ownerId = item._id?.toString();
      if (ownerId && result[ownerId]) {
        const emailCount = await TemporaryEmail.countDocuments({
          mailboxId: { $in: item.mailboxIds },
        });
        result[ownerId] = {
          mailboxes: (result[ownerId]?.mailboxes || 0) + safeNumber(item.count),
          emails: (result[ownerId]?.emails || 0) + safeNumber(emailCount),
        };
      }
    }
  } catch {
    // Mongo fallback
  }

  return result;
}

/**
 * Mark expired mailboxes in both Cloudflare D1 and MongoDB.
 */
export async function cleanExpiredMailboxes(): Promise<{
  d1Modified: number;
  mongoModified: number;
  totalModified: number;
}> {
  let d1Modified = 0;
  let mongoModified = 0;

  // 1. Cloudflare D1 update
  try {
    const d1Sql = `
      UPDATE mailboxes 
      SET status = 'expired' 
      WHERE status = 'active' AND expires_at < datetime('now');
    `;
    const results = await queryD1(d1Sql);
    if (results) {
      d1Modified = 1;
    }
  } catch {
    // D1 fallback
  }

  // 2. MongoDB update
  try {
    await connectDb();
    const now = new Date();
    const result = await TemporaryMailbox.updateMany(
      { status: "active", expiresAt: { $lt: now } },
      { $set: { status: "expired", deletedAt: new Date() } }
    );
    mongoModified = result.modifiedCount || 0;
  } catch {
    // Mongo fallback
  }

  return {
    d1Modified,
    mongoModified,
    totalModified: d1Modified + mongoModified,
  };
}

export interface ActiveMailboxItem {
  id: string;
  publicAddress: string;
  ownerId: string;
  ownerName?: string;
  ownerEmail?: string;
  status: "active" | "expired" | "deleted";
  createdAt: string;
  expiresAt: string;
  messageCount: number;
  source: "cloudflare_d1" | "mongodb";
}

/**
 * Fetch all active temporary mailboxes with owner and message statistics.
 */
export async function getRealtimeActiveMailboxes(): Promise<ActiveMailboxItem[]> {
  const mailboxesMap = new Map<string, ActiveMailboxItem>();
  const ownerIds = new Set<string>();

  // 1. Fetch active mailboxes from Cloudflare D1
  try {
    const d1Sql = `
      SELECT id, owner_id, public_address, status, created_at, expires_at
      FROM mailboxes
      WHERE status = 'active'
      ORDER BY created_at DESC
      LIMIT 200;
    `;
    const d1Mailboxes = await queryD1<{
      id: string;
      owner_id: string;
      public_address: string;
      status: string;
      created_at: string;
      expires_at: string;
    }>(d1Sql);

    const d1EmailCounts = await queryD1<{ mailbox_id: string; count: number }>(
      `SELECT mailbox_id, COUNT(*) as count FROM emails GROUP BY mailbox_id;`
    );
    const d1CountMap = new Map<string, number>();
    for (const c of d1EmailCounts) {
      if (c.mailbox_id) d1CountMap.set(c.mailbox_id, safeNumber(c.count));
    }

    for (const mb of d1Mailboxes) {
      if (!mb.public_address) continue;
      const addr = mb.public_address.toLowerCase().trim();
      if (mb.owner_id) ownerIds.add(mb.owner_id);

      mailboxesMap.set(addr, {
        id: mb.id || addr,
        publicAddress: addr,
        ownerId: mb.owner_id || "",
        status: "active",
        createdAt: mb.created_at || new Date().toISOString(),
        expiresAt: mb.expires_at || new Date().toISOString(),
        messageCount: d1CountMap.get(mb.id) || 0,
        source: "cloudflare_d1",
      });
    }
  } catch {
    // D1 fallback
  }

  // 2. Fetch active mailboxes from MongoDB
  try {
    await connectDb();
    const mongoMailboxes = await TemporaryMailbox.find({ status: "active" })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    if (mongoMailboxes.length > 0) {
      const mbIds = mongoMailboxes.map((m) => m._id);
      const emailCounts = await TemporaryEmail.aggregate([
        { $match: { mailboxId: { $in: mbIds } } },
        { $group: { _id: "$mailboxId", count: { $sum: 1 } } },
      ]);
      const mongoCountMap = new Map<string, number>();
      for (const c of emailCounts) {
        if (c._id) mongoCountMap.set(c._id.toString(), safeNumber(c.count));
      }

      for (const mb of mongoMailboxes) {
        const addr = mb.publicAddress.toLowerCase().trim();
        if (mb.ownerId) ownerIds.add(mb.ownerId);

        // If not already from D1 or to supplement
        if (!mailboxesMap.has(addr)) {
          mailboxesMap.set(addr, {
            id: mb._id.toString(),
            publicAddress: addr,
            ownerId: mb.ownerId || "",
            status: "active",
            createdAt: mb.createdAt ? new Date(mb.createdAt).toISOString() : new Date().toISOString(),
            expiresAt: mb.expiresAt ? new Date(mb.expiresAt).toISOString() : new Date().toISOString(),
            messageCount: mongoCountMap.get(mb._id.toString()) || 0,
            source: "mongodb",
          });
        }
      }
    }
  } catch {
    // Mongo fallback
  }

  // 3. Enrich owner email and name from User collection
  try {
    await connectDb();
    const validOwnerIds = Array.from(ownerIds).filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validOwnerIds.length > 0) {
      const users = await User.find({ _id: { $in: validOwnerIds } })
        .select("name email")
        .lean();
      const userMap = new Map<string, { name?: string; email: string }>();
      for (const u of users) {
        userMap.set(u._id.toString(), { name: u.name, email: u.email });
      }

      for (const mb of mailboxesMap.values()) {
        const userInfo = userMap.get(mb.ownerId);
        if (userInfo) {
          mb.ownerEmail = userInfo.email;
          mb.ownerName = userInfo.name;
        }
      }
    }
  } catch {
    // User enrich fallback
  }

  return Array.from(mailboxesMap.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Permanently delete / deactivate an active temporary mailbox across Cloudflare D1 and MongoDB.
 */
export async function adminDeleteMailbox(identifier: string): Promise<boolean> {
  let d1Deleted = false;
  let mongoDeleted = false;
  const cleanIdentifier = identifier.trim().toLowerCase();

  // 1. D1 Delete
  try {
    const now = new Date().toISOString();
    await queryD1(
      `UPDATE mailboxes SET status = 'deleted', expires_at = ?1 WHERE public_address = ?2 OR id = ?2;`,
      [now, cleanIdentifier]
    );
    await queryD1(
      `DELETE FROM emails WHERE mailbox_id IN (SELECT id FROM mailboxes WHERE public_address = ?1 OR id = ?1);`,
      [cleanIdentifier]
    );
    d1Deleted = true;
  } catch {
    // D1 fallback
  }

  // 2. Mongo Delete
  try {
    await connectDb();
    const isObjId = mongoose.Types.ObjectId.isValid(cleanIdentifier);
    const query = isObjId
      ? { $or: [{ _id: cleanIdentifier }, { publicAddress: cleanIdentifier }] }
      : { publicAddress: cleanIdentifier };

    const mailboxes = await TemporaryMailbox.find(query).lean();
    if (mailboxes.length > 0) {
      const ids = mailboxes.map((m) => m._id);
      await TemporaryMailbox.updateMany(
        { _id: { $in: ids } },
        { $set: { status: "deleted", deletedAt: new Date() } }
      );
      await TemporaryEmail.deleteMany({ mailboxId: { $in: ids } });
      mongoDeleted = true;
    }
  } catch {
    // Mongo fallback
  }

  return d1Deleted || mongoDeleted;
}
