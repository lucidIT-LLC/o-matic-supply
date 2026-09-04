import type { TokenStore } from "../types.js";
/**
 * Refresh-token storage backed by the macOS Keychain via the `security` CLI.
 *
 * The token never touches the filesystem, a log line, or an error message. The
 * CLI is invoked with execFile (no shell), so nothing is interpolated into a
 * command string.
 *
 * Known limitation: `security add-generic-password -w <secret>` places the
 * secret in the process argv, which is briefly readable by other processes of
 * the same user via `ps`. The `security` tool offers no stdin password input in
 * non-interactive mode. This is the standard trade-off every CLI-based keychain
 * integration makes; a native binding (node-keytar and friends) avoids it at
 * the cost of a compiled dependency.
 */
export declare class KeychainTokenStore implements TokenStore {
    readonly backend = "macos-keychain";
    private readonly service;
    constructor(service: string);
    static isSupported(): boolean;
    static assertSupported(): void;
    get(account: string): Promise<string | null>;
    set(account: string, secret: string): Promise<void>;
    delete(account: string): Promise<void>;
}
