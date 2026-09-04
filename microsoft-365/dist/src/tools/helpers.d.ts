import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
/** Wrap a value as MCP text content, JSON-encoded for machine consumption. */
export declare function jsonResult(value: unknown): CallToolResult;
export declare function errorResult(message: string): CallToolResult;
/**
 * Run a tool body, converting anything thrown into a clean isError result.
 *
 * A thrown exception across the MCP boundary is an opaque failure to the model;
 * a structured message with a "next step" is something it can act on.
 */
export declare function runTool(name: string, body: () => Promise<unknown>, args?: unknown): Promise<CallToolResult>;
