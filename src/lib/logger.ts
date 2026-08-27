/**
 * Structured logger.
 *
 * In development: writes to console with color.
 * In production: writes JSON to stdout for log aggregation (Vercel, Datadog, etc).
 *
 * Rules:
 * - NEVER log user PII (email, phone, password, token values).
 * - NEVER log API keys or secrets.
 * - ALWAYS include organizationId and userId when available.
 * - Use structured fields, not interpolated strings.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  organizationId?: string;
  userId?: string | null;
  requestId?: string;
  [key: string]: unknown;
}

function log(level: LogLevel, message: string, context?: LogContext) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  };

  if (process.env.NODE_ENV === "production") {
    process.stdout.write(JSON.stringify(entry) + "\n");
  } else {
    const prefix = {
      debug: "\x1b[36m[DEBUG]\x1b[0m",
      info: "\x1b[32m[INFO]\x1b[0m",
      warn: "\x1b[33m[WARN]\x1b[0m",
      error: "\x1b[31m[ERROR]\x1b[0m",
    }[level];

    if (level === "error") {
      console.error(prefix, message, context ?? "");
    } else if (level === "warn") {
      console.warn(prefix, message, context ?? "");
    } else {
      // Only warn and error in strict environments; debug/info only in dev
      if (process.env.NODE_ENV !== "test") {
        console.warn(prefix, message, context ?? "");
      }
    }
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) =>
    log("debug", message, context),
  info: (message: string, context?: LogContext) =>
    log("info", message, context),
  warn: (message: string, context?: LogContext) =>
    log("warn", message, context),
  error: (message: string, context?: LogContext) =>
    log("error", message, context),
};
