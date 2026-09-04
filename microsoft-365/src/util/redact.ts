/**
 * Defence in depth against leaking bearer tokens.
 *
 * Nothing in this project is *supposed* to put a token near a log line or an
 * error message, but "supposed to" is not a control. Every string that leaves
 * the process (stderr log, MCP tool error payload) is passed through here.
 */

const PATTERNS: Array<[RegExp, string]> = [
  // Authorization: Bearer <jwt-ish>
  [/(bearer\s+)[A-Za-z0-9._~+/=-]{20,}/gi, "$1<redacted>"],
  // Bare JWTs (three base64url segments).
  [/\beyJ[A-Za-z0-9._-]{10,}\.[A-Za-z0-9._-]{5,}\.[A-Za-z0-9._-]{5,}\b/g, "<redacted-jwt>"],
  // OAuth JSON fields.
  [
    /("?(?:access_token|refresh_token|id_token|client_secret|device_code|password)"?\s*[:=]\s*"?)([^",}\s]{6,})/gi,
    "$1<redacted>",
  ],
  // Microsoft refresh tokens (long opaque strings prefixed 0.A / 1.A ...).
  [/\b[01]\.A[A-Za-z0-9._~+/=-]{40,}\b/g, "<redacted-token>"],
];

/** Scrub anything that looks like a credential out of a string. */
export function redact(input: string): string {
  let out = input;
  for (const [pattern, replacement] of PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/** Redact a value of unknown shape, returning a safe string. */
export function redactUnknown(value: unknown): string {
  if (typeof value === "string") return redact(value);
  if (value instanceof Error) return redact(value.message);
  try {
    return redact(JSON.stringify(value));
  } catch {
    return "<unserialisable>";
  }
}
