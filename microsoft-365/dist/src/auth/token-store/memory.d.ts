import type { TokenStore } from "../types.js";
/**
 * Process-lifetime token store. Used by tests, and as an explicit opt-in for
 * hosts with no OS keyring — in which case sign-in is required on every start,
 * which is the correct trade-off rather than writing a token to disk.
 */
export declare class MemoryTokenStore implements TokenStore {
    readonly backend = "memory";
    private readonly entries;
    get(account: string): Promise<string | null>;
    set(account: string, secret: string): Promise<void>;
    delete(account: string): Promise<void>;
}
