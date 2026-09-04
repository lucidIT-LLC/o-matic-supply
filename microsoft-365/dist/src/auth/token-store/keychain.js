import { execFile } from "node:child_process";
import { platform } from "node:os";
import { promisify } from "node:util";
import { TokenStoreError } from "../../errors.js";
const run = promisify(execFile);
/** `security` exits 44 when the requested keychain item does not exist. */
const ERR_ITEM_NOT_FOUND = 44;
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
export class KeychainTokenStore {
    backend = "macos-keychain";
    service;
    constructor(service) {
        this.service = service;
    }
    static isSupported() {
        return platform() === "darwin";
    }
    static assertSupported() {
        if (!KeychainTokenStore.isSupported()) {
            throw new TokenStoreError(`The macOS Keychain token store cannot run on platform "${platform()}".`, `Implement a TokenStore for this platform (see src/auth/token-store/) or run the server on macOS.`);
        }
    }
    async get(account) {
        try {
            const { stdout } = await run("security", ["find-generic-password", "-s", this.service, "-a", account, "-w"], { encoding: "utf8", maxBuffer: 1024 * 1024 });
            const value = stdout.replace(/\n$/, "");
            return value === "" ? null : value;
        }
        catch (error) {
            const failure = error;
            if (failure.code === ERR_ITEM_NOT_FOUND || /could not be found/i.test(failure.stderr ?? "")) {
                return null;
            }
            throw new TokenStoreError(`Reading the stored refresh token from the macOS Keychain failed (exit ${String(failure.code)}).`, `Check that the login keychain is unlocked, then retry. Nothing is cached elsewhere, so this is recoverable.`);
        }
    }
    async set(account, secret) {
        try {
            await run("security", ["add-generic-password", "-U", "-s", this.service, "-a", account, "-w", secret], { encoding: "utf8" });
        }
        catch (error) {
            const failure = error;
            // Never echo stderr — an argv-echoing failure mode would leak the secret.
            throw new TokenStoreError(`Storing the refresh token in the macOS Keychain failed (exit ${String(failure.code)}).`, `Unlock the login keychain and retry. Until this succeeds every restart will require a fresh device-code sign-in.`);
        }
    }
    async delete(account) {
        try {
            await run("security", ["delete-generic-password", "-s", this.service, "-a", account], {
                encoding: "utf8",
            });
        }
        catch (error) {
            const failure = error;
            if (failure.code === ERR_ITEM_NOT_FOUND || /could not be found/i.test(failure.stderr ?? "")) {
                return; // Idempotent by contract.
            }
            throw new TokenStoreError(`Deleting the stored refresh token from the macOS Keychain failed (exit ${String(failure.code)}).`, `Remove the "${this.service}" entry manually in Keychain Access if this persists.`);
        }
    }
}
//# sourceMappingURL=keychain.js.map