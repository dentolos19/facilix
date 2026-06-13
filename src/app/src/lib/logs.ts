/**
 * Structured logging system for Facilix background tasks and services.
 *
 * Every logger instance is created with a namespace (e.g. "processor",
 * "openrouter", "observer").  Log entries are emitted as structured JSON
 * via `console.log` / `console.error` so they are automatically captured
 * by Cloudflare logpush and surfaced in the Observability dashboard.
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

    const json = JSON.stringify(entry);

    switch (level) {
      case "error":
        console.error(json);
        break;
      case "warn":
        console.warn(json);
        break;
      default:
        console.log(json);
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
