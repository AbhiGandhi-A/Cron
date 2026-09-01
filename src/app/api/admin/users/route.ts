import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import connectDb from "@/lib/mongodb";
import { User, TemporaryMailbox, TemporaryEmail } from "@/lib/models";
import { logError } from "@/lib/security";

export async function GET(req: NextRequest) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  try {
    await connectDb();

    const searchParams = req.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || ""; // "active" | "blocked" | ""
    const sort = searchParams.get("sort") || "createdAt"; // "createdAt" | "name" | "email"
    const order = searchParams.get("order") || "desc"; // "asc" | "desc"

    const skip = (page - 1) * Math.min(limit, 100);

    // Build query
    const query: Record<string, unknown> = {};
    if (status) {
      if (status === "blocked") {
        query.status = "blocked";
      } else if (status === "active") {
        query.$or = [
          { status: "active" },
          { status: { $exists: false } },
          { status: null },
          { status: { $ne: "blocked" } },
        ];
      }
    }
    if (search) {
      const searchOr = [
        { email: { $regex: search, $options: "i" } },
        { name: { $regex: search, $options: "i" } },
      ];
      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: searchOr }];
        delete query.$or;
      } else {
        query.$or = searchOr;
      }
    }

    // Get total count
    const total = await User.countDocuments(query);

    // Get users
    const users = await User.find(query)
      .select("-password")
      .sort({ [sort]: order === "desc" ? -1 : 1 })
      .skip(skip)
      .limit(Math.min(limit, 100))
      .lean();

    // Enrich with temp mail info
    const userIds = users.map((u) => u._id);
    const mailboxCounts = await TemporaryMailbox.aggregate([
      {
        $lookup: {
          from: "temporarymailboxes",
          let: { mailboxId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$_id", "$$mailboxId"] },
                status: "active",
              },
            },
          ],
          as: "mailbox",
        },
      },
      {
        $group: {
          _id: "$ownerId",
          count: { $sum: 1 },
        },
      },
    ]);

    const mailboxMap = Object.fromEntries(
      mailboxCounts.map((m) => [m._id, m.count])
    );

    const enrichedUsers = await Promise.all(
      users.map(async (user) => {
        const mailboxCount = mailboxMap[user._id?.toString()] || 0;
        const emailCount = await TemporaryEmail.countDocuments({
          mailboxId: {
            $in: await TemporaryMailbox.distinct("_id", {
              ownerId: user._id?.toString(),
            }),
          },
        });

        return {
          ...user,
          status: user.status === "blocked" ? "blocked" : "active",
          plan: user.plan || "free",
          maxJobs: user.maxJobs || 10,
          maxExecutions: user.maxExecutions || 1000,
          tempMailDisabled: Boolean(user.tempMailDisabled),
          tempMailboxes: mailboxCount,
          tempEmails: emailCount,
        };
      })
    );

    return NextResponse.json({
      users: enrichedUsers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / Math.min(limit, 100)),
      },
    });
  } catch (error) {
    logError("admin-users", "Failed to fetch users", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
