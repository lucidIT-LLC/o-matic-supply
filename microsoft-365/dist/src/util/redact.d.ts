/**
 * Defence in depth against leaking bearer tokens.
 *
 * Nothing in this project is *supposed* to put a token near a log line or an
 * error message, but "supposed to" is not a control. Every string that leaves
 * the process (stderr log, MCP tool error payload) is passed through here.
 */
/** Scrub anything that looks like a credential out of a string. */
export declare function redact(input: string): string;
/** Redact a value of unknown shape, returning a safe string. */
export declare function redactUnknown(value: unknown): string;
