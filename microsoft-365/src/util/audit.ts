import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

import { log } from "./logger.js";
import { redact } from "./redact.js";

/**
 * Append-only, hash-chained audit of every tool call.
 *
 * Why this exists: the connector uses *delegated* permissions, so every Graph
 * write lands in the tenant's unified audit log under the signed-in person's
 * identity. That preserves attribution to a human and destroys attribution to
 * the mechanism — the tenant log cannot distinguish "James moved the card"
 * from "an assistant acting as James moved the card". This file is the other
 * half of that record, and reconciling the two is what makes the distinction
 * recoverable after the fact.
 *
 * Each record carries the SHA-256 of the previous one, so a deletion, edit or
 * reorder breaks verification at that record rather than passing silently.
 *
 * No caller-supplied free text is written here. Arguments are reduced to their
 * key names plus identifier-shaped values; anything longer is recorded as a
 * digest and a length. The point is to be able to confirm or refute a
 * candidate action during an investigation, not to keep a second copy of
 * tenant content on the workstation.
 */

const GENESIS = "0".repeat(64);
const MAX_INLINE = 96;

let auditPath: string | null = null;
let prevHash: string | null = null;
let seq = 0;
let actor = "unknown";
let disabled = false;

function defaultPath(): string {
  return process.env.TEAM_ASSISTANT_AUDIT ?? join(homedir(), ".team-assistant", "audit.jsonl");
}

/** Called once at start-up, after config is loaded. */
export function initAudit(path?: string): void {
  auditPath = path ?? defaultPath();
  try {
    mkdirSync(dirname(auditPath), { recursive: true });
    if (existsSync(auditPath)) {
      const lines = readFileSync(auditPath, "utf8").trimEnd().split("\n").filter(Boolean);
      const last = lines[lines.length - 1];
      if (last) {
        const parsed = JSON.parse(last) as { hash?: string; seq?: number };
        prevHash = parsed.hash ?? GENESIS;
        seq = (parsed.seq ?? 0) + 1;
      }
    }
    prevHash ??= GENESIS;
  } catch (error) {
    // An unwritable audit sink must not take the connector down, but it must
    // be loud — a silent audit gap is worse than a noisy one.
    disabled = true;
    log.warn(`Audit disabled: ${redact(String(error))}`);
  }
}

/** Record who is signed in, once known. */
export function setAuditActor(upn: string): void {
  actor = upn;
}

/** Reduce arguments to something safe to keep on disk. */
export function safeMeta(args: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!args || typeof args !== "object") return out;
  for (const [k, v] of Object.entries(args as Record<string, unknown>)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "boolean" || typeof v === "number") {
      out[k] = String(v);
      continue;
    }
    if (Array.isArray(v)) {
      out[k] = `[${v.length}]`;
      continue;
    }
    if (typeof v !== "string") {
      out[k] = typeof v;
      continue;
    }
    out[k] =
      v.length <= MAX_INLINE
        ? redact(v)
        : `sha256:${createHash("sha256").update(v).digest("hex").slice(0, 16)}+${v.length}`;
  }
  return out;
}

export function auditToolCall(entry: {
  tool: string;
  ok: boolean;
  ms: number;
  meta?: Record<string, string>;
  error?: string;
}): void {
  if (disabled || !auditPath) return;
  const record: Record<string, unknown> = {
    ts: new Date().toISOString(),
    seq: seq++,
    actor,
    source: "team-assistant-mcp",
    tool: entry.tool,
    ok: entry.ok,
    ms: entry.ms,
    meta: entry.meta ?? {},
    prev: prevHash ?? GENESIS,
  };
  if (entry.error) record.error = redact(entry.error).slice(0, 240);
  const hash = createHash("sha256").update(JSON.stringify(record)).digest("hex");
  record.hash = hash;
  prevHash = hash;
  try {
    appendFileSync(auditPath, JSON.stringify(record) + "\n", { mode: 0o600 });
  } catch (error) {
    disabled = true;
    log.warn(`Audit write failed, disabling: ${redact(String(error))}`);
  }
}

/** Walk the chain and report the first record where it breaks. */
export function verifyAudit(path?: string): { ok: boolean; records: number; brokenAt?: number } {
  const file = path ?? auditPath ?? defaultPath();
  if (!existsSync(file)) return { ok: true, records: 0 };
  const lines = readFileSync(file, "utf8").trimEnd().split("\n").filter(Boolean);
  let expected = GENESIS;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const parsed = JSON.parse(line) as Record<string, unknown>;
    const { hash, ...rest } = parsed;
    if (rest.prev !== expected) return { ok: false, records: lines.length, brokenAt: i };
    const recomputed = createHash("sha256").update(JSON.stringify(rest)).digest("hex");
    if (recomputed !== hash) return { ok: false, records: lines.length, brokenAt: i };
    expected = hash as string;
  }
  return { ok: true, records: lines.length };
}
