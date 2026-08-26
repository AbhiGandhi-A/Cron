import { z } from "zod";

const allowedMethods = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

const safeString = (maxLength: number, field: string) =>
  z
    .string()
    .trim()
    .min(1, `${field} is required`)
    .max(maxLength, `${field} is too long`)
    .refine((value) => !/[\u0000-\u001F\u007F]/u.test(value), `${field} contains invalid characters`);

export const createJobSchema = z.object({
  name: safeString(255, "Name"),
  url: z.string().trim().url("Invalid URL").max(2048, "URL is too long").refine((value) => {
    try {
      const parsed = new URL(value);
      return ["http:", "https:"].includes(parsed.protocol);
    } catch {
      return false;
    }
  }, "Only HTTP/HTTPS URLs are allowed"),
  method: z.enum(allowedMethods),
  headers: z.record(z.string().max(255), z.string().max(4096)).optional().nullable().refine((value) => {
    if (!value) return true;
    return Object.entries(value).every(([key, headerValue]) => {
      const normalized = key.toLowerCase();
      return !["authorization", "cookie", "set-cookie", "x-api-key", "proxy-authorization"].includes(normalized) && String(headerValue).length <= 4096;
    });
  }, "Sensitive headers are not allowed here"),
  body: z.any().optional().nullable(),
  schedule: safeString(255, "Schedule"),
  isActive: z.boolean().default(true),
  timeout: z.number().int().min(1000).max(300000).default(30000),
  retryCount: z.number().int().min(0).max(10).default(3),
}).strict();

export const updateJobSchema = createJobSchema.partial();

export const registerSchema = z.object({
  name: safeString(100, "Name"),
  email: z.string().trim().toLowerCase().email("Invalid email").max(255),
  password: z.string().min(12, "Password must be at least 12 characters").max(128),
}).strict();

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email").max(255),
  password: z.string().min(1, "Password is required").max(128),
}).strict();

export type CreateJobInput = z.infer<typeof createJobSchema>;
export type UpdateJobInput = z.infer<typeof updateJobSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export const SCHEDULE_OPTIONS = [
  { label: "Every 1 minute", value: "* * * * *" },
  { label: "Every 5 minutes", value: "*/5 * * * *" },
  { label: "Every 15 minutes", value: "*/15 * * * *" },
  { label: "Every 30 minutes", value: "*/30 * * * *" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every day at midnight", value: "0 0 * * *" },
  { label: "Every day at noon", value: "0 12 * * *" },
  { label: "Every Monday", value: "0 0 * * 1" },
  { label: "Custom", value: "custom" },
] as const;
