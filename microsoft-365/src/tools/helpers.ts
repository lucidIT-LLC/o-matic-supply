import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { toToolMessage } from "../errors.js";
import { auditToolCall, safeMeta } from "../util/audit.js";
import { log } from "../util/logger.js";
import { redact } from "../util/redact.js";

/** Wrap a value as MCP text content, JSON-encoded for machine consumption. */
export function jsonResult(value: unknown): CallToolResult {
  const text =
    typeof value === "string" ? value : JSON.stringify(value, null, 2) ?? String(value);
  return { content: [{ type: "text", text: redact(text) }] };
}

export function errorResult(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: redact(message) }] };
}

/**
 * Run a tool body, converting anything thrown into a clean isError result.
 *
 * A thrown exception across the MCP boundary is an opaque failure to the model;
 * a structured message with a "next step" is something it can act on.
 */
export async function runTool(
  name: string,
  body: () => Promise<unknown>,
  args?: unknown,
): Promise<CallToolResult> {
  const started = Date.now();
  const meta = safeMeta(args);
  try {
    const result = jsonResult(await body());
    auditToolCall({ tool: name, ok: true, ms: Date.now() - started, meta });
    return result;
  } catch (error) {
    const message = toToolMessage(error);
    log.warn(`${name} failed: ${message}`);
    auditToolCall({ tool: name, ok: false, ms: Date.now() - started, meta, error: message });
    return errorResult(message);
  }
}
