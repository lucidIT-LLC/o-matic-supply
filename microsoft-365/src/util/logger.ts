import { redactUnknown } from "./redact.js";

/**
 * stdout is the MCP transport. Anything written there that is not a JSON-RPC
 * frame corrupts the session, so all diagnostics go to stderr — always.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function configuredLevel(): LogLevel {
  const raw = (process.env.OMATIC_M365_LOG_LEVEL ?? "info").toLowerCase();
  return raw in ORDER ? (raw as LogLevel) : "info";
}

function emit(level: LogLevel, message: string, detail?: unknown): void {
  if (ORDER[level] < ORDER[configuredLevel()]) return;
  const line = `[team-assistant-mcp] ${new Date().toISOString()} ${level.toUpperCase()} ${redactUnknown(message)}`;
  const suffix = detail === undefined ? "" : ` ${redactUnknown(detail)}`;
  process.stderr.write(`${line}${suffix}\n`);
}

export const log = {
  debug: (message: string, detail?: unknown) => emit("debug", message, detail),
  info: (message: string, detail?: unknown) => emit("info", message, detail),
  warn: (message: string, detail?: unknown) => emit("warn", message, detail),
  error: (message: string, detail?: unknown) => emit("error", message, detail),
};
