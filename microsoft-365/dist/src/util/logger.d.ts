/**
 * stdout is the MCP transport. Anything written there that is not a JSON-RPC
 * frame corrupts the session, so all diagnostics go to stderr — always.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";
export declare const log: {
    debug: (message: string, detail?: unknown) => void;
    info: (message: string, detail?: unknown) => void;
    warn: (message: string, detail?: unknown) => void;
    error: (message: string, detail?: unknown) => void;
};
