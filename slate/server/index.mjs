#!/usr/bin/env node
/*
 * o-MATIC Supply — Slate API connector (MIT).
 *
 * A deliberately narrow stdio MCP proxy. The O-Matic Server is still the
 * authority: it validates the bearer token, factory grant, tenant, revision
 * conflict, and audit record. This process persists neither token nor canvas.
 */
import { createInterface } from "node:readline";

const PROTOCOL = process.env.MCP_PROTOCOL_VERSION || "2025-06-18";
const REMOTE_TOOLS = new Set([
  "slate_canvas_create", "slate_canvas_open", "slate_revision_commit",
  "slate_revision_restore", "slate_asset_put", "slate_asset_get",
]);
const DEFAULT_CONNECTION = process.env.OMATIC_SLATE_CONNECTION || "";
let remoteSession = "";

function fail(message) {
  throw new Error(message);
}

function remoteConfig() {
  const rawUrl = process.env.OMATIC_SERVER_URL || "";
  const token = process.env.OMATIC_SERVER_TOKEN || "";
  if (!rawUrl || !token || !DEFAULT_CONNECTION) {
    fail("Slate is not configured. Set OMATIC_SERVER_URL, OMATIC_SERVER_TOKEN, and OMATIC_SLATE_CONNECTION in the host environment.");
  }
  let url;
  try { url = new URL(rawUrl); } catch { fail("OMATIC_SERVER_URL must be an absolute HTTPS URL."); }
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "::1" || url.hostname === "localhost";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    fail("OMATIC_SERVER_URL must use HTTPS (HTTP is permitted only for loopback development).");
  }
  if (!url.pathname || url.pathname === "/") url.pathname = "/mcp";
  return { url, token };
}

function result(id, value) {
  return { jsonrpc: "2.0", id, result: value };
}

function error(id, code, message) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

function textResult(id, value, isError = false) {
  return result(id, { content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) }], isError });
}

async function remoteRpc(method, params) {
  const { url, token } = remoteConfig();
  const headers = {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    accept: "application/json",
    "mcp-protocol-version": PROTOCOL,
  };
  if (remoteSession) headers["mcp-session-id"] = remoteSession;
  const response = await fetch(url, {
    method: "POST", headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(30_000),
  });
  const assignedSession = response.headers.get("mcp-session-id");
  if (assignedSession) remoteSession = assignedSession;
  if (!response.ok) fail(`O-Matic Server request failed with HTTP ${response.status}.`);
  let body;
  try { body = await response.json(); } catch { fail("O-Matic Server returned an invalid JSON response."); }
  if (body.error) fail(`O-Matic Server refused the request: ${body.error.message || "unknown error"}`);
  if (!body.result) fail("O-Matic Server returned no MCP result.");
  return body.result;
}

async function ensureRemote() {
  if (remoteSession) return;
  await remoteRpc("initialize", { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: "o-matic-slate-api", version: "0.1.0" } });
}

const localTools = [{
  name: "slate_api_status",
  title: "Check Slate API readiness",
  description: "Verify that this connector can reach the configured O-Matic Server and that its Slate tools are published. It does not reveal the token.",
  inputSchema: { type: "object", properties: {} },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
}];

async function listTools() {
  // Tool discovery must remain usable while a host is being configured. The
  // status tool then explains the missing remote side; it never exposes a
  // token or turns an unconfigured connector into a fake ready surface.
  try {
    await ensureRemote();
    const remote = await remoteRpc("tools/list", {});
    const tools = (remote.tools || []).filter((tool) => REMOTE_TOOLS.has(tool.name));
    return [...localTools, ...tools];
  } catch {
    return [...localTools];
  }
}

async function callTool(name, args) {
  if (name === "slate_api_status") {
    const tools = await listTools();
    const available = tools.filter((tool) => REMOTE_TOOLS.has(tool.name)).map((tool) => tool.name);
    return { ready: available.length === REMOTE_TOOLS.size, connection: DEFAULT_CONNECTION, available, missing: [...REMOTE_TOOLS].filter((name) => !available.includes(name)) };
  }
  if (!REMOTE_TOOLS.has(name)) fail(`Unknown Slate tool: ${name}`);
  if (!args || typeof args !== "object" || Array.isArray(args)) fail("Slate tool arguments must be an object.");
  if (args.connection && args.connection !== DEFAULT_CONNECTION) fail("This Slate connector is bound to its configured factory connection.");
  await ensureRemote();
  const forwarded = await remoteRpc("tools/call", { name, arguments: { ...args, connection: DEFAULT_CONNECTION } });
  if (forwarded.isError) fail(forwarded.content?.[0]?.text || "O-Matic Server refused the Slate operation.");
  return forwarded;
}

async function route(message) {
  if (message.method === "initialize") {
    return result(message.id, { protocolVersion: PROTOCOL, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "o-matic-slate-api", version: "0.1.0" }, instructions: "Slate is a narrow connector to the governed O-Matic Server API. The server—not this proxy—owns authorization, tenant isolation, revisions, assets, and audit." });
  }
  if (message.method === "notifications/initialized") return null;
  if (message.method === "ping") return result(message.id, {});
  if (message.method === "tools/list") return result(message.id, { tools: await listTools() });
  if (message.method === "tools/call") {
    const name = message.params?.name;
    if (typeof name !== "string") return error(message.id, -32602, "tools/call requires params.name.");
    const output = await callTool(name, message.params?.arguments || {});
    return output?.content ? result(message.id, output) : textResult(message.id, output);
  }
  return message.id === undefined ? null : error(message.id, -32601, `Unsupported method: ${message.method}`);
}

function write(value) { process.stdout.write(`${JSON.stringify(value)}\n`); }

if (process.argv.includes("--self-test")) {
  if (REMOTE_TOOLS.size !== 6 || !REMOTE_TOOLS.has("slate_revision_restore")) fail("Slate tool allowlist is incomplete.");
  if (DEFAULT_CONNECTION && DEFAULT_CONNECTION.length > 400) fail("Configured Slate connection is invalid.");
  console.log("Slate Supply connector self-test: PASS");
  process.exit(0);
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", async (line) => {
  if (!line.trim()) return;
  let message;
  try { message = JSON.parse(line); } catch { write(error(null, -32700, "Parse error")); return; }
  try {
    const response = await route(message);
    if (response) write(response);
  } catch (cause) {
    if (message.id !== undefined) write(error(message.id, -32603, cause instanceof Error ? cause.message : "Slate connector failure."));
  }
});
