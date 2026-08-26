import { sanitizeForLog, sanitizeUrlForLog } from "../src/lib/security-core";

type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

function formatTime(): string {
  return new Date().toISOString();
}

function formatMessage(level: LogLevel, component: string, message: string): string {
  return "[" + formatTime() + "] [" + level + "] [" + component + "] " + sanitizeForLog(message, 4000);
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return sanitizeForLog(error.message, 1000);
  }
  if (typeof error === "string") {
    return sanitizeForLog(error, 1000);
  }
  return "[REDACTED]";
}

export const logger = {
  info(component: string, message: string) {
    console.log(formatMessage("INFO", component, sanitizeUrlForLog(message)));
  },
  warn(component: string, message: string) {
    console.warn(formatMessage("WARN", component, sanitizeUrlForLog(message)));
  },
  error(component: string, message: string, error?: unknown) {
    console.error(formatMessage("ERROR", component, sanitizeUrlForLog(message)));
    if (error !== undefined) {
      console.error("  Error:", formatError(error));
    }
  },
  debug(component: string, message: string) {
    if (process.env.DEBUG === "true") {
      console.log(formatMessage("DEBUG", component, sanitizeUrlForLog(message)));
    }
  },
};
