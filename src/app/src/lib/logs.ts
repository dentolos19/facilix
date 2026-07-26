/**
 * Consistent logging for Facilix background tasks and services.
 *
 * By default emits clean human-readable log lines:
 *
 *     2026-06-17T13:40:15.123Z  INFO   frame processed  {"frameId":5}
 *     2026-06-17T13:40:15.123Z  ERROR  API call failed
 *
 * Set `LOG_FORMAT=json` in the environment to emit structured objects for
 * Cloudflare Logs or log aggregation:
 *
 *     {"timestamp":"...","level":"info","message":"frame processed","data":{"frameId":5}}
 *
 * Usage:
 * ```ts
 * import { createLogger } from "#/lib/logs";
 * const log = createLogger("my-module");
 *
 * log.info("frame processed", { frameId, objectCount: 5 });
 * log.error("upload failed", { assetId, error: err });
 * ```
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogException {
  type: string;
  message: string;
  stack: string;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: Record<string, unknown>;
  exception?: LogException;
}

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

/** Match Python's ConsoleFormatter output exactly. */
function formatConsole(entry: LogEntry): string {
  const level = entry.level.toUpperCase().padEnd(5);
  const line = `${entry.timestamp}  ${level}  ${singleLine(entry.message)}`;
  const data = entry.data ? `  ${JSON.stringify(entry.data)}` : "";
  const exception = entry.exception ? `  ${entry.exception.type}: ${singleLine(entry.exception.message)}` : "";

  return `${line}${data}${exception}`;
}

function singleLine(value: string) {
  return value.replaceAll("\r", "\\r").replaceAll("\n", "\\n");
}

/** Convert values that Workers Logs cannot index reliably into plain JSON. */
function normalizeData(data: Record<string, unknown>) {
  const seen = new WeakSet<object>();

  return JSON.parse(
    JSON.stringify(data, (_key, value: unknown) => {
      if (typeof value === "bigint") {
        return value.toString();
      }
      if (value instanceof Error) {
        return { type: value.name, message: value.message, stack: value.stack ?? `${value.name}: ${value.message}` };
      }
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) {
          return "[Circular]";
        }
        seen.add(value);
      }
      return value;
    }),
  ) as Record<string, unknown>;
}

const logFormat =
  typeof process === "undefined" ? "console" : (process.env.LOG_FORMAT ?? process.env.FACILIX_LOG_FORMAT ?? "console");
const useJson = logFormat.toLowerCase() === "json";

/**
 * Create a namespaced logger.
 *
 * `debug` entries are emitted via `console.log` (lowest priority).
 * `info` entries are emitted via `console.log`.
 * `warn` entries are emitted via `console.warn`.
 * `error` entries are emitted via `console.error`.
 */
export function createLogger(_namespace: string): Logger {
  function emit(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };
    if (data && Object.keys(data).length > 0) {
      const { error, ...context } = data;
      if (error instanceof Error) {
        entry.exception = {
          type: error.name,
          message: error.message,
          stack: error.stack ?? `${error.name}: ${error.message}`,
        };
      } else if (error !== undefined) {
        context.error = error;
      }
      if (Object.keys(context).length > 0) {
        entry.data = normalizeData(context);
      }
    }

    const output = useJson ? entry : formatConsole(entry);

    switch (level) {
      case "error":
        console.error(output);
        break;
      case "warn":
        console.warn(output);
        break;
      default:
        console.log(output);
    }
  }

  return {
    debug(message, data) {
      emit("debug", message, data);
    },
    info(message, data) {
      emit("info", message, data);
    },
    warn(message, data) {
      emit("warn", message, data);
    },
    error(message, data) {
      emit("error", message, data);
    },
  };
}
