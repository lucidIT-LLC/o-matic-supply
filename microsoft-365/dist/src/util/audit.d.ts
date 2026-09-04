/** Called once at start-up, after config is loaded. */
export declare function initAudit(path?: string): void;
/** Record who is signed in, once known. */
export declare function setAuditActor(upn: string): void;
/** Reduce arguments to something safe to keep on disk. */
export declare function safeMeta(args: unknown): Record<string, string>;
export declare function auditToolCall(entry: {
    tool: string;
    ok: boolean;
    ms: number;
    meta?: Record<string, string>;
    error?: string;
}): void;
/** Walk the chain and report the first record where it breaks. */
export declare function verifyAudit(path?: string): {
    ok: boolean;
    records: number;
    brokenAt?: number;
};
