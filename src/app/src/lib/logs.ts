/**
 * Logging system for Facilix background tasks and services.
 *
 * By default emits clean human-readable log lines:
 *
 *     2026-06-17T13:40:15Z  INFO  [processor]  frame processed  {"frameId":5}
 *     2026-06-17T13:40:15Z ERROR  [openrouter]  API call failed
 *
 * Set `FACILIX_LOG_FORMAT=json` in the environment to emit structured
 * JSON (one object per line) for Cloudflare logpush or log aggregation:
 *
 *     {"level":"info","namespace":"processor","message":"frame processed","timestamp":"...","data":{"frameId":5}}
 *
 * Usage:
 * ```ts
 * import { createLogger } from "#/lib/logs";
 * const log = createLogger("my-module");
 *
 * log.info("frame processed", { frameId, objectCount: 5 });
 * log.error("upload failed", { assetId, error: err.message });
 * ```
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  namespace: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

/** Match Python's ConsoleFormatter output exactly. */
function formatConsole(entry: LogEntry): string {
  const level = entry.level.padEnd(5);
  const line = `${entry.timestamp}  ${level}  [${entry.namespace}]  ${entry.message}`;
  if (entry.data && Object.keys(entry.data).length > 0) {
    return `${line}\n  ${JSON.stringify(entry.data)}`;
  }
  return line;
}

/** Compact JSON (one object per line) for log aggregation. */
function formatJson(entry: LogEntry): string {
  return JSON.stringify(entry);
}

const useJson = typeof process !== "undefined" && process.env?.FACILIX_LOG_FORMAT === "json";

/**
 * Create a namespaced logger.
 *
 * `debug` entries are emitted via `console.log` (lowest priority).
 * `info` entries are emitted via `console.log`.
 * `warn` entries are emitted via `console.warn`.
 * `error` entries are emitted via `console.error`.
 */
export function createLogger(namespace: string): Logger {
  function emit(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    const entry: LogEntry = {
      level,
      namespace,
      message,
      timestamp: new Date().toISOString(),
    };
    if (data && Object.keys(data).length > 0) {
      entry.data = data;
    }

    const output = useJson ? formatJson(entry) : formatConsole(entry);

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
