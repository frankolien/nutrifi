/**
 * Pino logger — structured JSON in prod, pretty-printed in dev.
 *
 * Everything in the service layer logs through this. No `console.log` —
 * structured logs let you grep by `loan`, `borrower`, `tx` etc. once
 * you're shipping to a real cluster.
 */

import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport: isDev
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:HH:MM:ss.l",
          ignore: "pid,hostname",
        },
      }
    : undefined,
});

/** Child logger with a `component` field — use per-service. */
export function scopedLogger(component: string) {
  return logger.child({ component });
}
