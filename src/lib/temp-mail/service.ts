import mongoose from "mongoose";
import connectDb from "@/lib/mongodb";
import { TemporaryMailbox, TemporaryEmail } from "@/lib/models";
import type { ITemporaryMailbox } from "@/lib/models";
import { getEmailReceiver } from "./provider";
import { generateMailboxId, generateMailboxToken, hashMailboxToken, getExpirationMinutes, getTempMailDomain } from "./token";
import { sanitizeHtml, sanitizeFilename, isSafeAttachmentMimeType } from "./security";
import type { InboundEmail } from "./types";
import { logError } from "@/lib/security-core";

type LeanMailbox = Pick<
  ITemporaryMailbox,
  "_id" | "ownerId" | "publicAddress" | "mailboxTokenHash" | "providerMailboxId" | "status" | "expiresAt" | "deletedAt"
>;

export interface CreateMailboxResult {
  publicAddress: string;
  mailboxToken: string;
  expiresAt: Date;
}

export async function createMailbox(ownerId: string): Promise<CreateMailboxResult> {
  await connectDb();

  // Mark any previous active mailboxes for this owner as deleted
  await TemporaryMailbox.updateMany(
    { ownerId, status: "active" },
    { $set: { status: "deleted", deletedAt: new Date() } }
  );

  const provider = getEmailReceiver();
  const domain = getTempMailDomain();
  const mailboxId = generateMailboxId();
  const publicAddress = `${mailboxId}@${domain}`;
  const mailboxToken = generateMailboxToken();
  const mailboxTokenHash = hashMailboxToken(mailboxToken);
  const expiresAt = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000);

  let providerMailboxId: string | null = null;

  if (provider.isConfigured()) {
    try {
      const result = await provider.createMailbox(publicAddress);
      providerMailboxId = result.providerMailboxId;
    } catch (error) {
      logError("temp-mail", "Provider mailbox creation failed", error);
    }
  }

  const mailbox = await TemporaryMailbox.create({
    ownerId,
    publicAddress,
    mailboxTokenHash,
    providerMailboxId,
    status: "active",
    expiresAt,
  });

  return {
    publicAddress: mailbox.publicAddress,
    mailboxToken,
    expiresAt: mailbox.expiresAt,
  };
}

export async function getActiveMailbox(ownerId: string): Promise<{
  publicAddress: string;
  mailboxToken: string;
  expiresAt: Date;
  isExpired: boolean;
} | null> {
  await connectDb();

  const mailbox = await TemporaryMailbox.findOne({
    ownerId,
    status: { $in: ["active", "expired"] },
  })
    .sort({ createdAt: -1 })
    .lean();

  if (!mailbox) return null;

  if (mailbox.status === "expired") {
    const nextExpiresAt = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000);
    await TemporaryMailbox.updateOne(
      { _id: mailbox._id },
      {
        $set: {
          status: "active",
          deletedAt: null,
          expiresAt: nextExpiresAt,
        },
      }
    );
    mailbox.status = "active";
    mailbox.expiresAt = nextExpiresAt;
  }

  const mailboxToken = generateMailboxToken();
  const mailboxTokenHash = hashMailboxToken(mailboxToken);
  await TemporaryMailbox.updateOne(
    { _id: mailbox._id },
    { $set: { mailboxTokenHash } }
  );

  return {
    publicAddress: mailbox.publicAddress,
    mailboxToken,
    expiresAt: mailbox.expiresAt,
    isExpired: false,
  };
}

async function pruneMailboxMessages(mailboxId: mongoose.Types.ObjectId | string): Promise<void> {
  const messages = await TemporaryEmail.find({ mailboxId }).sort({ receivedAt: -1, _id: -1 }).select("_id").lean();
  if (messages.length <= 6) return;

  const idsToDelete = messages.slice(6).map((message) => message._id);
  if (idsToDelete.length === 0) return;

  await TemporaryEmail.deleteMany({ _id: { $in: idsToDelete } });
}

export async function deleteMailbox(ownerId: string): Promise<boolean> {
  await connectDb();

  const mailbox = await TemporaryMailbox.findOne({
    ownerId,
    status: { $in: ["active", "expired"] },
  });

  if (!mailbox) return false;

  const provider = getEmailReceiver();
  if (provider.isConfigured() && mailbox.providerMailboxId) {
    try {
      await provider.deleteMailbox(mailbox.providerMailboxId);
    } catch (error) {
      logError("temp-mail", "Provider mailbox deletion failed", error);
    }
  }

  mailbox.status = "deleted";
  mailbox.deletedAt = new Date();
  await mailbox.save();

  await TemporaryEmail.deleteMany({ mailboxId: mailbox._id });

  return true;
}

export async function verifyMailboxOwnership(
  ownerId: string,
  mailboxToken: string,
  publicAddress: string
): Promise<{ valid: boolean; mailbox?: LeanMailbox }> {
  await connectDb();

  const mailbox = await TemporaryMailbox.findOne({
    publicAddress: publicAddress.toLowerCase().trim(),
    status: { $in: ["active", "expired"] },
  }).lean<LeanMailbox>();

  if (!mailbox) return { valid: false };

  if (mailbox.ownerId !== ownerId) return { valid: false };

  if (mailbox.status === "expired") {
    const nextExpiresAt = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000);
    await TemporaryMailbox.updateOne(
      { _id: mailbox._id },
      {
        $set: {
          status: "active",
          deletedAt: null,
          expiresAt: nextExpiresAt,
        },
      }
    );
    mailbox.status = "active";
    mailbox.expiresAt = nextExpiresAt;
  }

  const tokenHash = hashMailboxToken(mailboxToken);
  if (tokenHash !== mailbox.mailboxTokenHash) return { valid: false };

  return { valid: true, mailbox };
}

export async function storeInboundEmail(email: InboundEmail): Promise<boolean> {
  await connectDb();

  const mailbox = await TemporaryMailbox.findOne({
    publicAddress: email.to.toLowerCase().trim(),
    status: "active",
  });

  if (!mailbox) return false;

  const existing = await TemporaryEmail.findOne({
    mailboxId: mailbox._id,
    messageId: email.messageId,
  }).lean();

  if (existing) return false;

  const sanitizedHtml = sanitizeHtml(email.htmlBody);

  const attachments = (email.attachments || [])
    .filter((a) => isSafeAttachmentMimeType(a.contentType))
    .map((a) => ({
      filename: sanitizeFilename(a.filename),
      contentType: a.contentType,
      size: a.size,
      attachmentId: a.attachmentId,
    }));

  const size = Buffer.byteLength(email.textBody + email.htmlBody + email.subject, "utf8");

  await TemporaryEmail.create({
    mailboxId: mailbox._id,
    messageId: email.messageId,
    from: email.from,
    to: email.to.toLowerCase().trim(),
    subject: email.subject,
    textBody: email.textBody,
    sanitizedHtmlBody: sanitizedHtml,
    receivedAt: email.receivedAt,
    isRead: false,
    attachments,
    size,
  });

  await pruneMailboxMessages(mailbox._id);

  return true;
}

export async function listMessages(
  ownerId: string,
  mailboxToken: string,
  publicAddress: string,
  page: number,
  limit: number
) {
  const verification = await verifyMailboxOwnership(ownerId, mailboxToken, publicAddress);
  if (!verification.valid || !verification.mailbox) {
    return null;
  }

  const mailbox = verification.mailbox;

  const [messages, total] = await Promise.all([
    TemporaryEmail.find({ mailboxId: mailbox._id })
      .select("-textBody -sanitizedHtmlBody")
      .sort({ receivedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    TemporaryEmail.countDocuments({ mailboxId: mailbox._id }),
  ]);

  return {
    messages,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getMessage(
  ownerId: string,
  mailboxToken: string,
  publicAddress: string,
  messageId: string
) {
  const verification = await verifyMailboxOwnership(ownerId, mailboxToken, publicAddress);
  if (!verification.valid || !verification.mailbox) {
    return null;
  }

  const mailbox = verification.mailbox;

  const message = await TemporaryEmail.findOne({
    mailboxId: mailbox._id,
    _id: messageId,
  }).lean();

  return message;
}

export async function markMessageRead(
  ownerId: string,
  mailboxToken: string,
  publicAddress: string,
  messageId: string
): Promise<boolean> {
  const verification = await verifyMailboxOwnership(ownerId, mailboxToken, publicAddress);
  if (!verification.valid || !verification.mailbox) return false;

  const mailbox = verification.mailbox;

  const result = await TemporaryEmail.updateOne(
    { mailboxId: mailbox._id, _id: messageId },
    { $set: { isRead: true } }
  );

  return result.modifiedCount > 0;
}

export async function deleteMessage(
  ownerId: string,
  mailboxToken: string,
  publicAddress: string,
  messageId: string
): Promise<boolean> {
  const verification = await verifyMailboxOwnership(ownerId, mailboxToken, publicAddress);
  if (!verification.valid || !verification.mailbox) return false;

  const mailbox = verification.mailbox;

  const result = await TemporaryEmail.deleteOne({
    mailboxId: mailbox._id,
    _id: messageId,
  });

  return result.deletedCount > 0;
}

export async function isProviderConfigured(): Promise<boolean> {
  return getEmailReceiver().isConfigured();
}

async function expireStaleMailboxes(ownerId: string): Promise<void> {
  try {
    const stale = await TemporaryMailbox.find({
      ownerId,
      status: "active",
      expiresAt: { $lte: new Date() },
    });

    if (stale.length === 0) return;

    const provider = getEmailReceiver();
    const ids = stale.map((m) => m._id);

    for (const mailbox of stale) {
      if (provider.isConfigured() && mailbox.providerMailboxId) {
        try {
          await provider.deleteMailbox(mailbox.providerMailboxId);
        } catch {
          /* best effort cleanup */
        }
      }
    }

    await TemporaryMailbox.updateMany(
      { _id: { $in: ids } },
      { $set: { status: "expired", deletedAt: new Date() } }
    );

    await TemporaryEmail.deleteMany({ mailboxId: { $in: ids } });
  } catch (error) {
    logError("temp-mail", "Failed to expire stale mailboxes", error);
  }
}
