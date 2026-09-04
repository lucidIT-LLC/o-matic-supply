import type { TokenStore } from "../types.js";

/**
 * Process-lifetime token store. Used by tests, and as an explicit opt-in for
 * hosts with no OS keyring — in which case sign-in is required on every start,
 * which is the correct trade-off rather than writing a token to disk.
 */
export class MemoryTokenStore implements TokenStore {
  readonly backend = "memory";
  private readonly entries = new Map<string, string>();

  async get(account: string): Promise<string | null> {
    return this.entries.get(account) ?? null;
  }

  async set(account: string, secret: string): Promise<void> {
    this.entries.set(account, secret);
  }

  async delete(account: string): Promise<void> {
    this.entries.delete(account);
  }
}
