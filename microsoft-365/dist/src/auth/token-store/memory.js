/**
 * Process-lifetime token store. Used by tests, and as an explicit opt-in for
 * hosts with no OS keyring — in which case sign-in is required on every start,
 * which is the correct trade-off rather than writing a token to disk.
 */
export class MemoryTokenStore {
    backend = "memory";
    entries = new Map();
    async get(account) {
        return this.entries.get(account) ?? null;
    }
    async set(account, secret) {
        this.entries.set(account, secret);
    }
    async delete(account) {
        this.entries.delete(account);
    }
}
//# sourceMappingURL=memory.js.map