import { z } from "zod";

export const createMailboxSchema = z.object({}).strict();

export const messageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

export const messageIdParamSchema = z.object({
  id: z.string().min(1).max(255),
}).strict();
